!function(){"use strict";const e=function(e){let t;const n=new WebAssembly.Memory({initial:256,maximum:256});return WebAssembly.instantiate(e,{env:{abort:e=>{console.log("abort",e)},table:new WebAssembly.Table({initial:0,maximum:0,element:"anyfunc"}),__table_base:0,memory:n,__memory_base:1024,__memory_allocate:()=>{},__memory_free:()=>{},STACKTOP:0,STACK_MAX:n.buffer.byteLength}}).then(e=>t=e.instance.exports),async e=>(await async function(e){const t=e();return void 0===t?new Promise(function n(o){setTimeout(function(){let r=e();void 0===t?n(o):o(r)},100)}):t}(()=>!!t),e.map(e=>e.reduce((e,t)=>e+(1<<t),0)).map(t.setAnswer),t.getResults())}(new Uint8Array(atob("AGFzbQEAAAABGQVgAX8Bf2AAAGACf38AYAR/f39/AGAAAX8CDQEDZW52BWFib3J0AAMDBgUAAgQBAQQEAXAAAQUDAQABBgwCfwFByAALfwFBAAsHKwQGbWVtb3J5AgAFdGFibGUBAAlzZXRBbnN3ZXIAAgpnZXRSZXN1bHRzAAMIAQQJBwEAQQALAQUKqQEFHAAgAEECSARAQQEPCyAAQQJrEAEgAEEBaxABagsqACMBQQFqJAEjAUEZSgRAQQBB0ABBD0EREAAACyABQRlqQQJ0IAA6AAALUwEEfwNAIABBGUgEQCAAQRlqQQJ0LQAAIAAiAiMAKAIAIgMoAgBJBH8gAiADai0ACAUAC0H/AXFGBEAgAUEBIAB0aiEBCyAAQQFqIQAMAQsLIAELBwBBKBABGgsDAAELC10DAEEICyEZAAAAAAAAAAEEBAEMCAkIBA4EDgICCAQEAggIBwwEDwYAQcgACwUIAAAAGQBB0AALJREAAABhAHMAcwBlAG0AYgBsAHkALwBpAG4AZABlAHgALgB0AHM=").split("").map(e=>e.charCodeAt(0))));var t=function(){},n={},o=[],r=[];function s(e,s){var i,a,l,u,p=r;for(u=arguments.length;u-- >2;)o.push(arguments[u]);for(s&&null!=s.children&&(o.length||o.push(s.children),delete s.children);o.length;)if((a=o.pop())&&void 0!==a.pop)for(u=a.length;u--;)o.push(a[u]);else"boolean"==typeof a&&(a=null),(l="function"!=typeof e)&&(null==a?a="":"number"==typeof a?a=String(a):"string"!=typeof a&&(l=!1)),l&&i?p[p.length-1]+=a:p===r?p=[a]:p.push(a),i=l;var c=new t;return c.nodeName=e,c.children=p,c.attributes=null==s?void 0:s,c.key=null==s?void 0:s.key,void 0!==n.vnode&&n.vnode(c),c}function i(e,t){for(var n in t)e[n]=t[n];return e}function a(e,t){null!=e&&("function"==typeof e?e(t):e.current=t)}var l="function"==typeof Promise?Promise.resolve().then.bind(Promise.resolve()):setTimeout,u=/acit|ex(?:s|g|n|p|$)|rph|ows|mnc|ntw|ine[ch]|zoo|^ord/i,p=[];function c(e){!e._dirty&&(e._dirty=!0)&&1==p.push(e)&&(n.debounceRendering||l)(d)}function d(){for(var e;e=p.pop();)e._dirty&&k(e)}function f(e,t){return e.normalizedNodeName===t||e.nodeName.toLowerCase()===t.toLowerCase()}function A(e){var t=i({},e.attributes);t.children=e.children;var n=e.nodeName.defaultProps;if(void 0!==n)for(var o in n)void 0===t[o]&&(t[o]=n[o]);return t}function m(e){var t=e.parentNode;t&&t.removeChild(e)}function h(e,t,n,o,r){if("className"===t&&(t="class"),"key"===t);else if("ref"===t)a(n,null),a(o,e);else if("class"!==t||r)if("style"===t){if(o&&"string"!=typeof o&&"string"!=typeof n||(e.style.cssText=o||""),o&&"object"==typeof o){if("string"!=typeof n)for(var s in n)s in o||(e.style[s]="");for(var s in o)e.style[s]="number"==typeof o[s]&&!1===u.test(s)?o[s]+"px":o[s]}}else if("dangerouslySetInnerHTML"===t)o&&(e.innerHTML=o.__html||"");else if("o"==t[0]&&"n"==t[1]){var i=t!==(t=t.replace(/Capture$/,""));t=t.toLowerCase().substring(2),o?n||e.addEventListener(t,v,i):e.removeEventListener(t,v,i),(e._listeners||(e._listeners={}))[t]=o}else if("list"!==t&&"type"!==t&&!r&&t in e){try{e[t]=null==o?"":o}catch(e){}null!=o&&!1!==o||"spellcheck"==t||e.removeAttribute(t)}else{var l=r&&t!==(t=t.replace(/^xlink:?/,""));null==o||!1===o?l?e.removeAttributeNS("http://www.w3.org/1999/xlink",t.toLowerCase()):e.removeAttribute(t):"function"!=typeof o&&(l?e.setAttributeNS("http://www.w3.org/1999/xlink",t.toLowerCase(),o):e.setAttribute(t,o))}else e.className=o||""}function v(e){return this._listeners[e.type](n.event&&n.event(e)||e)}var _=[],g=0,b=!1,y=!1;function w(){for(var e;e=_.shift();)n.afterMount&&n.afterMount(e),e.componentDidMount&&e.componentDidMount()}function C(e,t,n,o,r,s){g++||(b=null!=r&&void 0!==r.ownerSVGElement,y=null!=e&&!("__preactattr_"in e));var i=B(e,t,n,o,s);return r&&i.parentNode!==r&&r.appendChild(i),--g||(y=!1,s||w()),i}function B(e,t,n,o,r){var s=e,i=b;if(null!=t&&"boolean"!=typeof t||(t=""),"string"==typeof t||"number"==typeof t)return e&&void 0!==e.splitText&&e.parentNode&&(!e._component||r)?e.nodeValue!=t&&(e.nodeValue=t):(s=document.createTextNode(t),e&&(e.parentNode&&e.parentNode.replaceChild(s,e),E(e,!0))),s.__preactattr_=!0,s;var a,l,u=t.nodeName;if("function"==typeof u)return function(e,t,n,o){var r=e&&e._component,s=r,i=e,a=r&&e._componentConstructor===t.nodeName,l=a,u=A(t);for(;r&&!l&&(r=r._parentComponent);)l=r.constructor===t.nodeName;r&&l&&(!o||r._component)?(q(r,u,3,n,o),e=r.base):(s&&!a&&(M(s),e=i=null),r=N(t.nodeName,u,n),e&&!r.nextBase&&(r.nextBase=e,i=null),q(r,u,1,n,o),e=r.base,i&&e!==i&&(i._component=null,E(i,!1)));return e}(e,t,n,o);if(b="svg"===u||"foreignObject"!==u&&b,u=String(u),(!e||!f(e,u))&&(a=u,(l=b?document.createElementNS("http://www.w3.org/2000/svg",a):document.createElement(a)).normalizedNodeName=a,s=l,e)){for(;e.firstChild;)s.appendChild(e.firstChild);e.parentNode&&e.parentNode.replaceChild(s,e),E(e,!0)}var p=s.firstChild,c=s.__preactattr_,d=t.children;if(null==c){c=s.__preactattr_={};for(var v=s.attributes,_=v.length;_--;)c[v[_].name]=v[_].value}return!y&&d&&1===d.length&&"string"==typeof d[0]&&null!=p&&void 0!==p.splitText&&null==p.nextSibling?p.nodeValue!=d[0]&&(p.nodeValue=d[0]):(d&&d.length||null!=p)&&function(e,t,n,o,r){var s,i,a,l,u,p=e.childNodes,c=[],d={},A=0,h=0,v=p.length,_=0,g=t?t.length:0;if(0!==v)for(var b=0;b<v;b++){var y=p[b],w=y.__preactattr_,C=g&&w?y._component?y._component.__key:w.key:null;null!=C?(A++,d[C]=y):(w||(void 0!==y.splitText?!r||y.nodeValue.trim():r))&&(c[_++]=y)}if(0!==g)for(var b=0;b<g;b++){l=t[b],u=null;var C=l.key;if(null!=C)A&&void 0!==d[C]&&(u=d[C],d[C]=void 0,A--);else if(h<_)for(s=h;s<_;s++)if(void 0!==c[s]&&(S=i=c[s],N=r,"string"==typeof(x=l)||"number"==typeof x?void 0!==S.splitText:"string"==typeof x.nodeName?!S._componentConstructor&&f(S,x.nodeName):N||S._componentConstructor===x.nodeName)){u=i,c[s]=void 0,s===_-1&&_--,s===h&&h++;break}u=B(u,l,n,o),a=p[b],u&&u!==e&&u!==a&&(null==a?e.appendChild(u):u===a.nextSibling?m(a):e.insertBefore(u,a))}var S,x,N;if(A)for(var b in d)void 0!==d[b]&&E(d[b],!1);for(;h<=_;)void 0!==(u=c[_--])&&E(u,!1)}(s,d,n,o,y||null!=c.dangerouslySetInnerHTML),function(e,t,n){var o;for(o in n)t&&null!=t[o]||null==n[o]||h(e,o,n[o],n[o]=void 0,b);for(o in t)"children"===o||"innerHTML"===o||o in n&&t[o]===("value"===o||"checked"===o?e[o]:n[o])||h(e,o,n[o],n[o]=t[o],b)}(s,t.attributes,c),b=i,s}function E(e,t){var n=e._component;n?M(n):(null!=e.__preactattr_&&a(e.__preactattr_.ref,null),!1!==t&&null!=e.__preactattr_||m(e),S(e))}function S(e){for(e=e.lastChild;e;){var t=e.previousSibling;E(e,!0),e=t}}var x=[];function N(e,t,n){var o,r=x.length;for(e.prototype&&e.prototype.render?(o=new e(t,n),T.call(o,t,n)):((o=new T(t,n)).constructor=e,o.render=Q);r--;)if(x[r].constructor===e)return o.nextBase=x[r].nextBase,x.splice(r,1),o;return o}function Q(e,t,n){return this.constructor(e,n)}function q(e,t,o,r,s){e._disable||(e._disable=!0,e.__ref=t.ref,e.__key=t.key,delete t.ref,delete t.key,void 0===e.constructor.getDerivedStateFromProps&&(!e.base||s?e.componentWillMount&&e.componentWillMount():e.componentWillReceiveProps&&e.componentWillReceiveProps(t,r)),r&&r!==e.context&&(e.prevContext||(e.prevContext=e.context),e.context=r),e.prevProps||(e.prevProps=e.props),e.props=t,e._disable=!1,0!==o&&(1!==o&&!1===n.syncComponentUpdates&&e.base?c(e):k(e,1,s)),a(e.__ref,e))}function k(e,t,o,r){if(!e._disable){var s,a,l,u=e.props,p=e.state,c=e.context,d=e.prevProps||u,f=e.prevState||p,m=e.prevContext||c,h=e.base,v=e.nextBase,b=h||v,y=e._component,B=!1,S=m;if(e.constructor.getDerivedStateFromProps&&(p=i(i({},p),e.constructor.getDerivedStateFromProps(u,p)),e.state=p),h&&(e.props=d,e.state=f,e.context=m,2!==t&&e.shouldComponentUpdate&&!1===e.shouldComponentUpdate(u,p,c)?B=!0:e.componentWillUpdate&&e.componentWillUpdate(u,p,c),e.props=u,e.state=p,e.context=c),e.prevProps=e.prevState=e.prevContext=e.nextBase=null,e._dirty=!1,!B){s=e.render(u,p,c),e.getChildContext&&(c=i(i({},c),e.getChildContext())),h&&e.getSnapshotBeforeUpdate&&(S=e.getSnapshotBeforeUpdate(d,f));var x,Q,T=s&&s.nodeName;if("function"==typeof T){var L=A(s);(a=y)&&a.constructor===T&&L.key==a.__key?q(a,L,1,c,!1):(x=a,e._component=a=N(T,L,c),a.nextBase=a.nextBase||v,a._parentComponent=e,q(a,L,0,c,!1),k(a,1,o,!0)),Q=a.base}else l=b,(x=y)&&(l=e._component=null),(b||1===t)&&(l&&(l._component=null),Q=C(l,s,c,o||!h,b&&b.parentNode,!0));if(b&&Q!==b&&a!==y){var U=b.parentNode;U&&Q!==U&&(U.replaceChild(Q,b),x||(b._component=null,E(b,!1)))}if(x&&M(x),e.base=Q,Q&&!r){for(var I=e,D=e;D=D._parentComponent;)(I=D).base=Q;Q._component=I,Q._componentConstructor=I.constructor}}for(!h||o?_.push(e):B||(e.componentDidUpdate&&e.componentDidUpdate(d,f,S),n.afterUpdate&&n.afterUpdate(e));e._renderCallbacks.length;)e._renderCallbacks.pop().call(e);g||r||w()}}function M(e){n.beforeUnmount&&n.beforeUnmount(e);var t=e.base;e._disable=!0,e.componentWillUnmount&&e.componentWillUnmount(),e.base=null;var o=e._component;o?M(o):t&&(null!=t.__preactattr_&&a(t.__preactattr_.ref,null),e.nextBase=t,m(t),x.push(e),S(t)),a(e.__ref,null)}function T(e,t){this._dirty=!0,this.context=t,this.props=e,this.state=this.state||{},this._renderCallbacks=[]}i(T.prototype,{setState:function(e,t){this.prevState||(this.prevState=this.state),this.state=i(i({},this.state),"function"==typeof e?e(this.state,this.props):e),t&&this._renderCallbacks.push(t),c(this)},forceUpdate:function(e){e&&this._renderCallbacks.push(e),k(this,2)},render:function(){}});const L=[{question:"以下文档声明正确的是：",radios:["<!doctype html>","<!DOCTYPE HTML 4.01>","<!DOCTYPE XHTML 1.0>","<!DOCTYPE XHTML 1.0 Frameset>"]},{question:"以下均为自封闭标签的是：",radios:["html,script","link,style","meta,input","img,textarea"]},{question:"以下标签包含顺序正确的有：",radios:["a>p>span","h2>p>a","ul>li>div","span>a>input"],muti:!0},{question:"定义提供有关页面的元信息的标签是：",radios:["meta","DOCTYPE","base","var"]},{question:"使表单支持文件上传功能，至少需要设置form标签的哪些属性",radios:["action","name","method","enctype"],muti:!0},{question:"以下有关样式表定义说法有误的是：",radios:["样式表都需要定义选择器","一组样式表可以定义多组属性","每组属性之间需要用;分隔","属性名不能使用字母和-以外的字符"],muti:!0},{question:"以下选择器定义的样式表可作用于相同标签时，权重最高的是：",radios:[".main p.inner","div.main > p","body .main p",".header + .main p"],muti:!0},{question:"IE6中，以下CSS选择器被支持的有：",radios:["span + p","ul > li",":after",".nav.current"],muti:!0},{question:"下列均属于行内标签的一组是：",radios:["span,p","ul,li","a,strong","div,dl"]},{question:"下列哪些position定义时, left属性可以生效：",radios:["static","relative","fixed","absolute"],muti:!0},{question:"以下javascript代码片段存在语法错误的是：",radios:["var fn = function(){};","Math.PI * 3","var c = 2.toString()","'7'-4"],muti:!0},{question:"选择正确的通用JSON格式(非javascript对象)：",radios:['{name:"lili"}','["ok",{"id":2}]','{"amount":1.44e+10,"owner":null}','{"male":true,"friends":["a","b"]}'],muti:!0},{question:"代码 `var a = {a:2}, b; b = a; b.a = ++a.a - 2; 则: a.a的值为： ` ",radios:["0","1","2","3"]},{question:"以下不属于javascript中Array对象方法或属性的有：",radios:["splice,slice","sort,shuffle","concat,join","shift,unshift"],muti:!0},{question:"以下匹配javascript中变量名的正则表达式是：",radios:[/^[a-zA-Z0-9]+$/,/^[\w\d]+$/,/^\w+$/,/^[a-zA-Z_\$]+[\w\$]*$/].map(e=>e.toString())},{question:"表示请求被客户端缓存的HTTP-code为：",radios:[200,404,304,500].map(e=>e.toString())},{question:"下列哪项属于GET请求和POST请求的不同点：",radios:["支持form标签表单提交","支持XMLHttpRequest","支持文件上传","支持下载文件"],muti:!0},{question:"对于服务器返回js资源文件正确的MIME为：",radios:["text/script","application/javascript","text/javascript","script/text"]},{question:"UserAgent: Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/46.0.2490.86 Safari/537.36  表示以下哪款浏览器",radios:["Microsoft Windows IE","Apple Safari","Mozilla Firefox","Google Chrome"]},{question:"下列哪项信息一般不是浏览器发送给服务器的：",radios:["cookie","user-agent","Accept-Encoding","Content-Type"]},{question:"同源策略, 是最常用的WEB安全策略, 这里的同源包括：",radios:["协议相同","域名相同","端口相同","请求路径相同"],muti:!0},{question:"下列哪些场景下不需要遵循同源策略",radios:["XMLHttpRequest","iframe间js操作","WebSocket通信","多媒体(Audio/Video)文件播放"],muti:!0},{question:"下列哪种常用的WEB服务器默认的端口号不含80：",radios:["Apache","IIS","Tomcat","Nginx"],muti:!0},{question:"以下哪些方式有利于从HTTP请求上对资源加载进行优化",radios:["合并过多的零碎文件","拆分过大的资源文件","服务器开启gzip压缩","对资源文件进行压缩"],muti:!0},{question:"以下哪些方式能有效的避免服务器的资源缓存",radios:["采用cdn优化资源","使用MD5重命名资源和引入","更新资源时添加必要的时间戳标记","模块化资源, 实现按需异步加载"],muti:!0}];class U extends T{constructor(e){super(e),this.state={answers:new Set},this.onCheck=(e=>{const{muti:t,onAnswer:n}=this.props;let{answers:o}=this.state;t?(o.has(e)?o.delete(e):o.add(e),this.setState({answers:o}),n([...o].sort())):o.has(e)||(o=new Set([e]),this.setState({answers:o}),n([...o].sort()))}),this.state={answers:new Set(e.answers||[])}}render(){const{answers:e}=this.state,{index:t,question:n,radios:o,muti:r,result:i}=this.props,a=r?"checkbox":"radio",l=void 0===i?"":i?"right":"wrong";return s("table",null,s("tr",null,s("td",{colSpan:o.length},t+1,". ",n," ",s("span",{class:"ans-holder"},"(",s("em",{class:`result-${l}`},[...e].sort().map(e=>"ABCDEFG".charAt(e)).join("")),")"))),s("tr",null,o.map((n,o)=>s("td",null,s("label",null,s("input",{type:a,name:`r-${t}`,value:o,checked:e.has(o),disabled:!!l,onClick:()=>this.onCheck(o)})," ",s("span",null,n))))))}}const I="STORE_KEY_FOR_EXAM";let D=localStorage.getItem(I),P={results:void 0,answers:[]};!function e(){localStorage.setItem(I,btoa(JSON.stringify(P))),window.__STORE_LOCKER__=requestAnimationFrame(e)}(),D&&(P=JSON.parse(atob(D)));var W,H,R;W=s(class extends T{constructor(){super(...arguments),this.state={questions:L,answers:P.answers,results:P.results},this.onSubmit=(t=>{t.preventDefault(),this.state.results?alert(`你的得分为: ${100*this.state.results.filter(e=>e).length/L.length}`):e(P.answers).then(e=>{const t=("0".repeat(25)+e.toString(2)).slice(-25).split("").map(e=>"1"===e).reverse();P.results=t,this.setState({results:t})})}),this.onAnswer=(e=>t=>{P.answers[e]=t,this.setState({answers:P.answers})})}render(){const{questions:e,results:t}=this.state,n=P.answers.filter(e=>e.length>0).length;return t&&alert(`你的得分为: ${100*t.filter(e=>e).length/e.length}`),s("form",{onSubmit:this.onSubmit},e.map((e,n)=>s(U,Object.assign({answers:P.answers[n],index:n},e,{result:t&&t[n],onAnswer:this.onAnswer(n)}))),s("div",{className:"text-center"},s("input",{type:"submit",value:"提交",disabled:e.length!=n})))}},{}),H=document.getElementById("app"),C(R,W,{},!1,H,!1)}();