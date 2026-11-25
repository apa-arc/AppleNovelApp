import type { NovelChapter, NovelContent, NovelDetail, NovelSummary } from "./novel";

type Node = { tag: string; attrs: Record<string,string>; children: Array<Node|string>; parent: Node|null };
const VOID = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);
const BLOCK = new Set(["article","blockquote","div","footer","h1","h2","h3","h4","header","li","main","ol","p","section","table","tr","td","th","ul"]);
const decode = (s:string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|mdash|ndash|hellip|ldquo|rdquo|lsquo|rsquo|middot|bull|copy);/gi,(a,e:string)=>{const k=e.toLowerCase();if(k==="amp")return"&";if(k==="lt")return"<";if(k==="gt")return">";if(k==="quot")return'"';if(k==="apos")return"'";if(k==="nbsp")return" ";if(k==="mdash")return"—";if(k==="ndash")return"–";if(k==="hellip")return"…";if(k==="ldquo")return"“";if(k==="rdquo")return"”";if(k==="lsquo")return"‘";if(k==="rsquo")return"’";if(k==="middot")return"·";if(k==="bull")return"•";if(k==="copy")return"©";const n=k.startsWith("#x")?parseInt(k.slice(2),16):parseInt(k.slice(1),10);return Number.isFinite(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):a;});

export function parseHtmlDocument(html:string):Node {
 if(html.length>1_000_000) throw new Error("HTML 页面超过 1 MB，已停止解析。");
 const root:Node={tag:"document",attrs:{},children:[],parent:null}, stack=[root];
 for(const token of html.match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>]*>|[^<]+|</g)||[]){
  if(token.startsWith("<!--")||/^<!/i.test(token)) continue;
  if(token.startsWith("</")){const name=token.slice(2).match(/^\s*([\w:-]+)/)?.[1]?.toLowerCase();if(name)for(let i=stack.length-1;i>0;i--)if(stack[i].tag===name){stack.length=i;break;}continue;}
  if(/^<[a-zA-Z]/.test(token)){const m=token.match(/^<\s*([\w:-]+)([\s\S]*?)\/?\s*>$/);if(!m)continue;const attrs:Record<string,string>={};const re=/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+)))?/g;let a:RegExpExecArray|null;while((a=re.exec(m[2])))attrs[a[1].toLowerCase()]=decode(a[2]??a[3]??a[4]??"");const parent=stack[stack.length-1],node:Node={tag:m[1].toLowerCase(),attrs,children:[],parent};parent.children.push(node);if(!VOID.has(node.tag)&&! /\/\s*>$/.test(token))stack.push(node);continue;}
  if(token)stack[stack.length-1].children.push(decode(token));
 }
 return root;
}
function all(n:Node):Node[]{const out:Node[]=[];for(const c of n.children)if(typeof c!=="string")out.push(c,...all(c));return out;}
function simple(n:Node,s:string):boolean{
 // Attribute values may contain dots or hashes (for example href$=".html").
 // Only interpret class/id syntax outside attribute selectors.
 const structural=s.replace(/\[[^\]]*\]/g,"");
 const tag=structural.match(/^([\w-]+|\*)/);if(tag&&tag[1]!=="*"&&n.tag!==tag[1].toLowerCase())return false;
 for(const m of structural.matchAll(/#([\w-]+)/g))if(n.attrs.id!==m[1])return false;
 const classes=(n.attrs.class||"").split(/\s+/);for(const m of structural.matchAll(/\.([\w-]+)/g))if(!classes.includes(m[1]))return false;
 for(const m of s.matchAll(/\[([\w:-]+)(?:\s*(\$=|\^=|\*=|~=|\|=|=)\s*["']?([^\]"']+)["']?)?\]/g)){const actual=n.attrs[m[1].toLowerCase()];if(actual===undefined)return false;const expected=m[3];if(expected!==undefined){const op=m[2];if(op==="="&&actual!==expected)return false;if(op==="$="&&!actual.endsWith(expected))return false;if(op==="^="&&!actual.startsWith(expected))return false;if(op==="*="&&!actual.includes(expected))return false;if(op==="~="&&!actual.split(/\s+/).includes(expected))return false;if(op==="|="&&actual!==expected&&!actual.startsWith(expected+"-"))return false;}}
 const siblings=n.parent?.children.filter(x=>typeof x!=="string")||[];
 const matchesNth=(position:number,expression:string)=>{const e=expression.replace(/\s+/g,"").toLowerCase();if(e==="odd")return position%2===1;if(e==="even")return position%2===0;if(/^[+-]?\d+$/.test(e))return position===Number(e);const m=e.match(/^([+-]?\d*)n([+-]\d+)?$/);if(!m)return false;const a=m[1]===""||m[1]==="+"?1:m[1]==="-"?-1:Number(m[1]),b=Number(m[2]||0),d=position-b;return a===0?d===0:d/a>=0&&Number.isInteger(d/a);};
 const nthChild=structural.match(/:nth-child\(([^)]*)\)/);if(nthChild&&!matchesNth(siblings.indexOf(n)+1,nthChild[1]))return false;
 const sameType=siblings.filter(x=>x.tag===n.tag),nthType=structural.match(/:nth-of-type\(([^)]*)\)/);if(nthType&&!matchesNth(sameType.indexOf(n)+1,nthType[1]))return false;
 if(/:first-child/.test(structural)&&siblings[0]!==n)return false;if(/:last-child/.test(structural)&&siblings[siblings.length-1]!==n)return false;return true;
}
function matches(n:Node,s:string):boolean{
 const parts=s.trim().replace(/\s*>\s*/g," > ").split(/\s+/).filter(Boolean);
 const walk=(node:Node|null,index:number):boolean=>{
  if(!node||index<0||!simple(node,parts[index]))return false;
  if(index===0)return true;
  if(parts[index-1]===">")return walk(node.parent,index-2);
  let parent:Node|null=node.parent;
  while(parent){if(walk(parent,index-1))return true;parent=parent.parent;}
  return false;
 };
 return parts.length>0&&walk(n,parts.length-1);
}
function assertSupportedSelector(selector:string):void{
 if(!selector.trim())throw new Error("CSS 选择器不能为空。");
 for(const group of selector.split(",")){
  const tokens=group.trim().replace(/\s*>\s*/g," ").split(/\s+/).filter(Boolean);
  if(!tokens.length)throw new Error("CSS 选择器格式无效。");
  for(let token of tokens){
   // Strip attribute selectors first so dots/hashes inside quoted values are not
   // mistaken for class or id selectors during syntax validation.
   token=token.replace(/\[[^\]]*\]/g,"");
   token=token.replace(/^(?:[a-zA-Z][\w-]*|\*)/,"");
   token=token.replace(/#[\w-]+/g,"").replace(/\.[\w-]+/g,"");
   token=token.replace(/:first-child|:last-child|:nth-child\([^)]*\)|:nth-of-type\([^)]*\)/g,"");
   if(token)throw new Error("暂不支持此 CSS 选择器语法："+token);
  }
 }
}
export function selectHtmlNodes(root:Node,selector:string):Node[]{assertSupportedSelector(selector);return all(root).filter(n=>selector.split(",").some(s=>matches(n,s.trim())));}
export function htmlNodeText(n:Node):string{const walk=(x:Node):string=>x.children.map(c=>typeof c==="string"?c:(["script","style","noscript"].includes(c.tag)?"":(["br","hr"].includes(c.tag)?"\n":(BLOCK.has(c.tag)?"\n":"")+walk(c)+(BLOCK.has(c.tag)?"\n":"")))).join("");return walk(n).replace(/[\t\f\v ]+/g," ").replace(/ *\n */g,"\n").replace(/\n{3,}/g,"\n\n").trim();}
function attr(n:Node,name:string):string{return n.attrs[name.toLowerCase()]||"";}
function textAt(n:Node,selector?:string,attribute?:string):string{const x=selector?selectHtmlNodes(n,selector)[0]:undefined;return x?(attribute?attr(x,attribute):htmlNodeText(x)):"";}
function safeUrl(v:string,base:string):string{try{const origin=new URL(base).origin,u=new URL(v,base);return u.protocol==="https:"&&!u.username&&!u.password&&u.origin===origin?u.toString():"";}catch{return"";}}
function safeCoverUrl(v:string,base:string):string{try{const u=new URL(v,base);if((u.protocol!=="https:"&&u.protocol!=="http:")||u.username||u.password)return"";if(u.protocol==="http:")u.protocol="https:";return u.toString();}catch{return"";}}

export type HtmlSearchRules={itemSelector:string;titleSelector:string;urlSelector:string;authorSelector?:string;descriptionSelector?:string;urlAttribute?:string;coverSelector?:string;coverAttribute?:string};
export type HtmlDetailRules={titleSelector?:string;authorSelector?:string;descriptionSelector?:string;titleAttribute?:string;authorAttribute?:string;descriptionAttribute?:string};
export type HtmlChapterRules={itemSelector:string;titleSelector:string;urlSelector:string;urlAttribute?:string};
export type HtmlContentRules={contentSelector:string;titleSelector?:string};
export function parseHtmlSearchResults(body:string,sourceId:string,sourceName:string,keyword:string,responseUrl:string,r:HtmlSearchRules):{keyword:string;sourceId:string;items:NovelSummary[];hasMore:boolean}{
 const root=parseHtmlDocument(body),items=selectHtmlNodes(root,r.itemSelector).flatMap((n,i)=>{const tn=r.titleSelector===":self"?n:selectHtmlNodes(n,r.titleSelector)[0],ln=r.urlSelector===":self"?n:selectHtmlNodes(n,r.urlSelector)[0],title=tn?htmlNodeText(tn):"",bookUrl=ln?safeUrl(attr(ln,r.urlAttribute||"href"),responseUrl):"";if(!title||!bookUrl)return[];const cv=(r.coverSelector?selectHtmlNodes(n,r.coverSelector)[0]:undefined)||selectHtmlNodes(n,"img")[0],coverCandidates=cv?[attr(cv,"data-src"),attr(cv,"data-original"),attr(cv,"data-lazy-src"),attr(cv,"data-lazyload"),attr(cv,"data-lazy"),attr(cv,"data-actualsrc"),attr(cv,"data-original-src"),attr(cv,"data-img"),attr(cv,"data-image"),attr(cv,"data-ks-lazyload"),attr(cv,"data-echo"),attr(cv,"data-url"),attr(cv,r.coverAttribute||"src"),attr(cv,"srcset").split(",")[0]?.trim().split(/\s+/)[0]||"",attr(cv,"src")]:[],coverRaw=coverCandidates.find((value)=>!!value.trim())||"",coverUrl=cv?safeCoverUrl(coverRaw,responseUrl):"";return[{id:sourceId+":"+i+":"+bookUrl,sourceId,sourceName,title,author:textAt(n,r.authorSelector)||"未知作者",description:textAt(n,r.descriptionSelector),bookUrl,...(coverUrl?{coverUrl}:{})}];});return{keyword,sourceId,items,hasMore:false};
}
export function parseHtmlNovelDetail(body:string,summary:NovelSummary,r:HtmlDetailRules):NovelDetail{const root=parseHtmlDocument(body);return{...summary,title:textAt(root,r.titleSelector,r.titleAttribute)||summary.title,author:textAt(root,r.authorSelector,r.authorAttribute)||summary.author,description:textAt(root,r.descriptionSelector,r.descriptionAttribute)||summary.description,chapters:[]};}
export function parseHtmlChapterList(body:string,novelId:string,responseUrl:string,r:HtmlChapterRules):NovelChapter[]{const root=parseHtmlDocument(body),out:NovelChapter[]=[];selectHtmlNodes(root,r.itemSelector).forEach((n,i)=>{const tn=r.titleSelector===":self"?n:selectHtmlNodes(n,r.titleSelector)[0],ln=r.urlSelector===":self"?n:selectHtmlNodes(n,r.urlSelector)[0],title=tn?htmlNodeText(tn):"",href=ln?safeUrl(attr(ln,r.urlAttribute||"href"),responseUrl):"";if(title&&href)out.push({id:novelId+":"+i+":"+href,novelId,title,url:href,index:out.length});});if(!out.length)throw new Error("HTML 章节规则没有匹配到有效章节。");return out;}
export function parseHtmlChapterContent(body:string,fallbackTitle:string,r:HtmlContentRules):NovelContent{const root=parseHtmlDocument(body),node=selectHtmlNodes(root,r.contentSelector)[0];if(!node)throw new Error("HTML 正文选择器未匹配到内容："+r.contentSelector);const content=htmlNodeText(node);if(!content)throw new Error("HTML 正文为空。");return{chapterId:"",title:textAt(root,r.titleSelector)||fallbackTitle,content};}
