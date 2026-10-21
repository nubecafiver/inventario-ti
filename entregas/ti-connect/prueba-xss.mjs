import fs from 'fs';
const s = fs.readFileSync(process.argv[2]||'./web/index.html','utf8');
const grab = (re)=>{const m=s.match(re); if(!m) throw new Error('no encontrado '+re); return m[0];};
const code = [grab(/function escH\(x\)\{[^\n]*\}/), grab(/function unH\(x\)\{[^\n]*\}/), grab(/function _ini\(n\)\{[^\n]*\}/),
  grab(/function ago\(ts\)\{[^\n]*\}/), grab(/function mapTicket\(d\)\{[^\n]*\}/), grab(/function mapMsg\(d\)\{[^\n]*\}/), grab(/function mapPost\(d\)\{[^\n]*\}/)].join('\n');
const f = new Function('DB', code + '\nreturn {mapTicket,mapMsg,mapPost,unH,escH};');
const X = f({me:{emp:'1'}});
const mal = '<img src=x onerror=alert(1)>"\'&';
let ok = true; const t = (c,m)=>{console.log((c?'OK   ':'FALLA ')+m); if(!c) ok=false;};
const tk = X.mapTicket({id:'a1',title:mal,categoria:mal,subcategoria:mal,area:mal,tipo:mal,prioridad:'"><script>',estado:mal,ownerName:mal,folio:mal,createdAt:null});
for (const k of ['t','c','s','ar','tp','p','st','rq','fol']) t(!/[<>"']/.test(tk[k]), 'ticket.'+k+' sin caracteres peligrosos');
t(X.unH(tk.t) === mal, 'el título se recupera idéntico para textContent');
const m = X.mapMsg({from:'user',authorName:mal,text:mal}); t(!/[<>"']/.test(m.t+m.n), 'mensaje escapado');
const p = X.mapPost({id:'p',authorRole:mal,authorName:mal,text:mal,docName:mal}); t(!/[<>"']/.test(p.author+p.text+p.ini+p.who+p.doc.name), 'publicación escapada');
t(X.mapTicket({id:'b',title:'Mi impresora & "nueva"',createdAt:null}).t === 'Mi impresora &amp; &quot;nueva&quot;', 'texto normal se muestra bien al pasar por innerHTML');
process.exit(ok?0:1);
