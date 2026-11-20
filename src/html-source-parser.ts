import type { NovelChapter, NovelContent, NovelDetail, NovelSummary } from "./novel";

type Node = { tag: string; attrs: Record<string,string>; children: Array<Node|string>; parent: Node|null };
const VOID = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);
const BLOCK = new Set(["article","blockquote","div","footer","h1","h2","h3","h4","header","li","main","ol","p","section","table","tr","ul"]);
const decode = (s:string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(a,e:string)=>{const k=e.toLowerCase();if(k==="amp")return"&";if(k==="lt")return"<";if(k==="gt")return">";if(k==="quot")return'"';if(k==="apos")return"'";if(k==="nbsp")return" ";const n=k.startsWith("#x")?parseInt(k.slice(2),16):parseInt(k.slice(1),10);return Number.isFinite(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):a;});

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
 const tag=s.match(/^([\w-]+|\*)/);if(tag&&tag[1]!=="*"&&n.tag!==tag[1].toLowerCase())return false;
 for(const m of s.matchAll(/#([\w-]+)/g))if(n.attrs.id!==m[1])return false;
 const classes=(n.attrs.class||"").split(/\s+/);for(const m of s.matchAll(/\.([\w-]+)/g))if(!classes.includes(m[1]))return false;
 for(const m of s.matchAll(/\[([\w:-]+)(?:\s*=\s*["']?([^\]"']+)["']?)?\]/g))if(!(m[1].toLowerCase() in n.attrs)||(m[2]!==undefined&&n.attrs[m[1].toLowerCase()]!==m[2]))return false;
 const siblings=n.parent?.children.filter(x=>typeof x!=="string")||[],nth=s.match(/:nth-child\((\d+)\)/);if(nth&&siblings.indexOf(n)!==Number(nth[1])-1)return false;if(/:first-child/.test(s)&&siblings[0]!==n)return false;if(/:last-child/.test(s)&&siblings[siblings.length-1]!==n)return false;return true;
}
function matches(n:Node,s:string):boolean{
 const parts=s.trim().replace(/\\s*>\\s*/g," > ").split(/\\s+/).filter(Boolean);
 if(!parts.length||!simple(n,parts.pop()!))return false;
 let cur:Node|null=n;
 for(let i=parts.length-1;i>=0;){
  if(parts[i]===">"){
   i--;
   if(i<0||!cur)return false;
   const parent:Node|null=cur.parent;
   if(!parent||!simple(parent,parts[i]))return false;
   cur=parent;
   i--;
  }else{
   let parent:Node|null=cur?.parent??null;
   while(parent&&!simple(parent,parts[i]))parent=parent.parent;
   if(!parent)return false;
   cur=parent;
   i--;
  }
 }
 return true;
}
export function selectHtmlNodes(root:Node,selector:string):Node[]{return selector.trim()?all(root).filter(n=>selector.split(",").some(s=>matches(n,s.trim()))):[];}
export function htmlNodeText(n:Node):string{const walk=(x:Node):string=>x.children.map(c=>typeof c==="string"?c:(["script","style","noscript"].includes(c.tag)?"":(BLOCK.has(c.tag)?"\n":"")+walk(c)+(BLOCK.has(c.tag)?"\n":""))).join("");return walk(n).replace(/[\t\f\v ]+/g," ").replace(/ *\n */g,"\n").replace(/\n{3,}/g,"\n\n").trim();}
function attr(n:Node,name:string):string{return n.attrs[name.toLowerCase()]||"";}
function textAt(n:Node,selector?:string):string{const x=selector?selectHtmlNodes(n,selector)[0]:undefined;return x?htmlNodeText(x):"";}
function safeUrl(v:string,base:string):string{try{const u=new URL(v,base);return u.protocol==="https:"&&!u.username&&!u.password?u.toString():"";}catch{return"";}}

export type HtmlSearchRules={itemSelector:string;titleSelector:string;urlSelector:string;authorSelector?:string;descriptionSelector?:string;urlAttribute?:string;coverSelector?:string;coverAttribute?:string};
export type HtmlDetailRules={titleSelector?:string;authorSelector?:string;descriptionSelector?:string};
export type HtmlChapterRules={itemSelector:string;titleSelector:string;urlSelector:string;urlAttribute?:string};
export type HtmlContentRules={contentSelector:string;titleSelector?:string};
export function parseHtmlSearchResults(body:string,sourceId:string,sourceName:string,keyword:string,responseUrl:string,r:HtmlSearchRules):{keyword:string;sourceId:string;items:NovelSummary[];hasMore:boolean}{
 const root=parseHtmlDocument(body),items=selectHtmlNodes(root,r.itemSelector).flatMap((n,i)=>{const tn=r.titleSelector===":self"?n:selectHtmlNodes(n,r.titleSelector)[0],ln=r.urlSelector===":self"?n:selectHtmlNodes(n,r.urlSelector)[0],title=tn?htmlNodeText(tn):"",bookUrl=ln?safeUrl(attr(ln,r.urlAttribute||"href"),responseUrl):"";if(!title||!bookUrl)return[];const cv=r.coverSelector?selectHtmlNodes(n,r.coverSelector)[0]:undefined,coverUrl=cv?safeUrl(attr(cv,r.coverAttribute||"src"),responseUrl):"";return[{id:sourceId+":"+i+":"+bookUrl,sourceId,sourceName,title,author:textAt(n,r.authorSelector)||"未知作者",description:textAt(n,r.descriptionSelector),bookUrl,...(coverUrl?{coverUrl}:{})}];});return{keyword,sourceId,items,hasMore:false};
}
export function parseHtmlNovelDetail(body:string,summary:NovelSummary,r:HtmlDetailRules):NovelDetail{const root=parseHtmlDocument(body);return{...summary,title:textAt(root,r.titleSelector)||summary.title,author:textAt(root,r.authorSelector)||summary.author,description:textAt(root,r.descriptionSelector)||summary.description,chapters:[]};}
export function parseHtmlChapterList(body:string,novelId:string,responseUrl:string,r:HtmlChapterRules):NovelChapter[]{const root=parseHtmlDocument(body),out:NovelChapter[]=[];selectHtmlNodes(root,r.itemSelector).forEach((n,i)=>{const tn=r.titleSelector===":self"?n:selectHtmlNodes(n,r.titleSelector)[0],ln=r.urlSelector===":self"?n:selectHtmlNodes(n,r.urlSelector)[0],title=tn?htmlNodeText(tn):"",href=ln?safeUrl(attr(ln,r.urlAttribute||"href"),responseUrl):"";if(title&&href)out.push({id:novelId+":"+i+":"+href,novelId,title,url:href,index:out.length});});if(!out.length)throw new Error("HTML 章节规则没有匹配到有效章节。");return out;}
export function parseHtmlChapterContent(body:string,fallbackTitle:string,r:HtmlContentRules):NovelContent{const root=parseHtmlDocument(body),node=selectHtmlNodes(root,r.contentSelector)[0];if(!node)throw new Error("HTML 正文选择器未匹配到内容："+r.contentSelector);const content=htmlNodeText(node);if(!content)throw new Error("HTML 正文为空。");return{chapterId:"",title:textAt(root,r.titleSelector)||fallbackTitle,content};}
