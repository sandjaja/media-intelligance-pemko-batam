export type SocialDiscoveryContext={
 method?:'keyword'|'hashtag'|'mention'|'account'|'search'|'other'|null;
 query?:string|null;
};

export type SocialParentContext={
 externalId?:string|null;
 contentType?:string|null;
 authorName?:string|null;
 authorHandle?:string|null;
 canonicalUrl?:string|null;
 title?:string|null;
 content?:string|null;
};

export type SocialConversationContext={
 discovery?:SocialDiscoveryContext|null;
 parentContent?:SocialParentContext|null;
 parentComment?:SocialParentContext|null;
};

/**
 * Builds a conservative context envelope for Social scope decisions.
 * Discovery queries are provenance only: they are intentionally excluded from
 * organization evidence so a broad collector query cannot make unrelated
 * content relevant by itself.
 */
export function buildSocialScopeText(input:{
 title?:string|null;
 content?:string|null;
 context?:SocialConversationContext|null;
}){
 const parent=input.context?.parentContent;
 const parentComment=input.context?.parentComment;
 const current=[input.title,input.content].filter(Boolean).join(' ').trim();
 const parentText=[parent?.title,parent?.content].filter(Boolean).join(' ').trim();
 const parentCommentText=[parentComment?.title,parentComment?.content].filter(Boolean).join(' ').trim();
 return{
  currentText:current,
  parentText,
  parentCommentText,
  combinedText:[current,parentCommentText,parentText].filter(Boolean).join(' ').trim(),
  discovery:input.context?.discovery??null
 };
}
