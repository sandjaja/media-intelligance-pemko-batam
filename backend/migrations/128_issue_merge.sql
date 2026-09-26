-- Persist the tested atomic Issue merge function.
-- Source of truth: pg_get_functiondef from the preview Neon database after dry-run validation.
-- Merge semantics protect manual evidence decisions over AI/automatic linkage.

BEGIN;

CREATE OR REPLACE FUNCTION public.merge_issue(p_source_issue_id bigint, p_target_issue_id bigint, p_user_id bigint, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_source RECORD;
    v_target RECORD;
BEGIN
    IF p_source_issue_id = p_target_issue_id THEN
        RAISE EXCEPTION 'ISSUE_MERGE_SAME_SOURCE_TARGET';
    END IF;

    IF length(trim(COALESCE(p_reason, ''))) < 3 THEN
        RAISE EXCEPTION 'ISSUE_MERGE_REASON_REQUIRED';
    END IF;

    SELECT id, organization_id, title, status
    INTO v_source
    FROM issues
    WHERE id = p_source_issue_id
    FOR UPDATE;

    SELECT id, organization_id, title, status
    INTO v_target
    FROM issues
    WHERE id = p_target_issue_id
    FOR UPDATE;

    IF v_source.id IS NULL OR v_target.id IS NULL THEN
        RAISE EXCEPTION 'ISSUE_NOT_FOUND';
    END IF;

    IF v_source.organization_id <> v_target.organization_id THEN
        RAISE EXCEPTION 'ISSUE_MERGE_DIFFERENT_ORGANIZATION';
    END IF;

    IF lower(v_source.status) NOT IN ('watch','active')
       OR lower(v_target.status) NOT IN ('watch','active') THEN
        RAISE EXCEPTION 'ISSUE_MERGE_REQUIRES_OPERATIONAL_ISSUES';
    END IF;

    INSERT INTO issue_articles (
        issue_id, article_id, relevance_score, assignment_source
    )
    SELECT p_target_issue_id, article_id, relevance_score, assignment_source
    FROM issue_articles
    WHERE issue_id = p_source_issue_id
    ON CONFLICT (issue_id, article_id)
    DO UPDATE SET
        relevance_score = CASE
            WHEN issue_articles.assignment_source = 'MANUAL' THEN issue_articles.relevance_score
            WHEN EXCLUDED.assignment_source = 'MANUAL' THEN EXCLUDED.relevance_score
            ELSE GREATEST(COALESCE(issue_articles.relevance_score,0), COALESCE(EXCLUDED.relevance_score,0))
        END,
        assignment_source = CASE
            WHEN issue_articles.assignment_source = 'MANUAL' OR EXCLUDED.assignment_source = 'MANUAL' THEN 'MANUAL'
            ELSE COALESCE(issue_articles.assignment_source, EXCLUDED.assignment_source)
        END;

    INSERT INTO issue_print_articles (
        issue_id, print_article_id, relevance_score, linkage_status, decided_by, decided_at, evidence
    )
    SELECT p_target_issue_id, print_article_id, relevance_score, linkage_status, decided_by, decided_at, evidence
    FROM issue_print_articles
    WHERE issue_id = p_source_issue_id
    ON CONFLICT (issue_id, print_article_id)
    DO UPDATE SET
        relevance_score = CASE
            WHEN issue_print_articles.decided_by IS NOT NULL THEN issue_print_articles.relevance_score
            WHEN EXCLUDED.decided_by IS NOT NULL THEN EXCLUDED.relevance_score
            ELSE GREATEST(COALESCE(issue_print_articles.relevance_score,0), COALESCE(EXCLUDED.relevance_score,0))
        END,
        linkage_status = CASE
            WHEN issue_print_articles.decided_by IS NOT NULL THEN issue_print_articles.linkage_status
            WHEN EXCLUDED.decided_by IS NOT NULL THEN EXCLUDED.linkage_status
            ELSE issue_print_articles.linkage_status
        END,
        decided_by = COALESCE(issue_print_articles.decided_by, EXCLUDED.decided_by),
        decided_at = COALESCE(issue_print_articles.decided_at, EXCLUDED.decided_at),
        evidence = CASE
            WHEN issue_print_articles.decided_by IS NOT NULL THEN issue_print_articles.evidence
            WHEN EXCLUDED.decided_by IS NOT NULL THEN EXCLUDED.evidence
            ELSE COALESCE(issue_print_articles.evidence, EXCLUDED.evidence)
        END;

    INSERT INTO social_mention_issues (
        mention_id, issue_id, relevance_score, linkage_source
    )
    SELECT mention_id, p_target_issue_id, relevance_score, linkage_source
    FROM social_mention_issues
    WHERE issue_id = p_source_issue_id
    ON CONFLICT (mention_id, issue_id)
    DO UPDATE SET
        relevance_score = CASE
            WHEN lower(COALESCE(social_mention_issues.linkage_source,'')) = 'manual' THEN social_mention_issues.relevance_score
            WHEN lower(COALESCE(EXCLUDED.linkage_source,'')) = 'manual' THEN EXCLUDED.relevance_score
            ELSE GREATEST(COALESCE(social_mention_issues.relevance_score,0), COALESCE(EXCLUDED.relevance_score,0))
        END,
        linkage_source = CASE
            WHEN lower(COALESCE(social_mention_issues.linkage_source,'')) = 'manual'
              OR lower(COALESCE(EXCLUDED.linkage_source,'')) = 'manual' THEN 'manual'
            ELSE COALESCE(social_mention_issues.linkage_source, EXCLUDED.linkage_source)
        END;

    INSERT INTO issue_opd (issue_id, opd_id, responsibility)
    SELECT p_target_issue_id, opd_id, responsibility
    FROM issue_opd
    WHERE issue_id = p_source_issue_id
    ON CONFLICT DO NOTHING;

    INSERT INTO issue_districts (issue_id, district_id, source, created_by)
    SELECT p_target_issue_id, district_id, source, created_by
    FROM issue_districts
    WHERE issue_id = p_source_issue_id
    ON CONFLICT DO NOTHING;

    UPDATE unified_candidate_issues
    SET issue_id = p_target_issue_id, updated_at = now()
    WHERE issue_id = p_source_issue_id;

    UPDATE issue_monitors
    SET status = 'CLOSED', updated_at = now()
    WHERE issue_id = p_source_issue_id
      AND status <> 'CLOSED';

    DELETE FROM issue_articles WHERE issue_id = p_source_issue_id;
    DELETE FROM issue_print_articles WHERE issue_id = p_source_issue_id;
    DELETE FROM social_mention_issues WHERE issue_id = p_source_issue_id;
    DELETE FROM issue_opd WHERE issue_id = p_source_issue_id;
    DELETE FROM issue_districts WHERE issue_id = p_source_issue_id;

    UPDATE issues
    SET status = 'archived', updated_at = now()
    WHERE id = p_source_issue_id;

    INSERT INTO audit_logs (user_id, action, metadata)
    VALUES (
        p_user_id,
        'ISSUE_MERGED',
        jsonb_build_object(
            'sourceIssueId', p_source_issue_id,
            'sourceTitle', v_source.title,
            'targetIssueId', p_target_issue_id,
            'targetTitle', v_target.title,
            'reason', trim(p_reason),
            'mergedAt', now()
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'sourceIssueId', p_source_issue_id,
        'targetIssueId', p_target_issue_id,
        'sourceStatus', 'archived',
        'targetStatus', v_target.status
    );
END;
$function$;

COMMIT;
