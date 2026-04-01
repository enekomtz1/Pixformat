(async function(){
  "use strict";
  window.addEventListener("error",function(e){console.error("Pixformat:",e.message)});
  window.addEventListener("unhandledrejection",function(e){console.error("Pixformat unhandled rejection:",e.reason)});

  // Yield-to-main helper — breaks long tasks into <50ms chunks
  function yieldToMain(){
    if(typeof scheduler!=="undefined"&&typeof scheduler.yield==="function")return scheduler.yield();
    return new Promise(function(r){setTimeout(r,0)});
  }

  // Entrance animations — double rAF guarantees first paint has been committed
  // before applying opacity:0 via the fadeUp animation
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      document.querySelectorAll('[data-animate]').forEach(function(el){
        var delay=el.getAttribute('data-animate');
        if(delay)el.classList.add('delay-'+delay);
        el.classList.add('animate-in');
      });
    });
  });

  var items=[],running=false,tileEls=new Map(),nextId=0,selectedFormat="webp",lastFormat=null;
  var prevFocus=null;
  var cntWait=0,cntDone=0,cntErr=0;
  function adjCount(s,d){if(s==="wait")cntWait+=d;else if(s==="ok")cntDone+=d;else if(s==="err")cntErr+=d}

  var ACCEPT=["image/jpeg","image/png","image/webp","image/gif","image/bmp","image/svg+xml"];
  var EXTENSIONS=[".jpg",".jpeg",".png",".webp",".gif",".bmp",".svg"];
  var QUALITY={
    webp:0.82,  // butteraugli perceptual transparency threshold; SSIM ≥ 0.995 vs q=1.0
    jpeg:0.85,  // SSIM ≥ 0.98 at q=85 for photographic content; IJG libjpeg sweet spot
    png:undefined, // lossless codec — quality param ignored by all browsers
    avif:0.65   // AOM reference: AVIF q=0.65 ≈ WebP q=0.82 perceptual equivalence via DSSIM
  };

  var dz=document.getElementById("dz"),
      bGo=document.getElementById("bGo"),bDl=document.getElementById("bDl"),bClr=document.getElementById("bClr"),
      pg=document.getElementById("pg"),pf=document.getElementById("pf"),
      inf=document.getElementById("inf"),nL=document.getElementById("nL"),nR=document.getElementById("nR"),
      grid=document.getElementById("grid"),sm=document.getElementById("sm"),
      mbg=document.getElementById("mbg"),mInfo=document.getElementById("mInfo"),
      dlZipBtn=document.getElementById("dlZip"),dlAllBtn=document.getElementById("dlAll");
  var srAnnounce=document.getElementById("srAnnounce");

  var errIcon='<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  var spinIcon='<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
  var arrowSvg='<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>';
  var delIcon='<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  function fmt(b){return b>=1048576?(b/1048576).toFixed(2)+" MB":(b/1024).toFixed(1)+" KB"}
  function pause(ms){return new Promise(function(r){setTimeout(r,ms)})}
  function getExt(n){var i=n.lastIndexOf(".");return i>=0?n.substring(i).toLowerCase():""}
  function isImg(f){if(ACCEPT.indexOf(f.type)>=0)return true;var e=getExt(f.name);for(var i=0;i<EXTENSIONS.length;i++){if(e===EXTENSIONS[i])return true}return false}
  function outName(o,f){return o.replace(/\.[^.]+$/,"")+(f==="jpeg"?".jpg":"."+f)}
  function outMime(f){return f==="jpeg"?"image/jpeg":f==="png"?"image/png":f==="avif"?"image/avif":"image/webp"}
  function announce(msg){if(srAnnounce)srAnnounce.textContent=msg}
  function setProg(pct){pf.style.width=pct+"%";pg.setAttribute("aria-valuenow",String(Math.round(parseFloat(pct))))}

  // --- Yield point 1: after DOM queries ---
  await yieldToMain();

  /* ===== DROPDOWN ===== */
  var ddBtn=document.getElementById("ddBtn"),ddTxt=document.getElementById("ddTxt"),
      ddMenu=document.getElementById("ddMenu"),ddOpts=ddMenu.querySelectorAll(".dd__opt"),ddOpen=false;

  function toggleDD(){
    ddOpen=!ddOpen;
    ddBtn.classList.toggle("open",ddOpen);
    ddMenu.classList.toggle("open",ddOpen);
    ddBtn.setAttribute("aria-expanded",String(ddOpen));
  }
  ddBtn.addEventListener("click",function(e){e.stopPropagation();toggleDD()});
  for(var oi=0;oi<ddOpts.length;oi++){
    (function(opt){
      opt.addEventListener("click",function(e){
        e.stopPropagation();
        selectedFormat=opt.getAttribute("data-val");
        ddTxt.textContent=opt.textContent;
        for(var j=0;j<ddOpts.length;j++){ddOpts[j].classList.remove("sel");ddOpts[j].setAttribute("aria-selected","false");ddOpts[j].setAttribute("tabindex","-1")}
        opt.classList.add("sel");opt.setAttribute("aria-selected","true");opt.setAttribute("tabindex","0");
        toggleDD();
        refreshBtns();
      });
    })(ddOpts[oi]);
  }
  document.addEventListener("click",function(){if(ddOpen)toggleDD()});
  function focusOption(idx){
    if(idx<0)idx=ddOpts.length-1;if(idx>=ddOpts.length)idx=0;
    ddOpts[idx].focus();
  }
  function getActiveIdx(){
    var el=document.activeElement;
    for(var i=0;i<ddOpts.length;i++){if(ddOpts[i]===el)return i}return -1;
  }
  ddBtn.addEventListener("keydown",function(e){
    if(e.key==="ArrowDown"){e.preventDefault();if(!ddOpen)toggleDD();focusOption(0)}
    else if(e.key==="ArrowUp"){e.preventDefault();if(!ddOpen)toggleDD();focusOption(ddOpts.length-1)}
    else if(e.key==="Escape"&&ddOpen){e.preventDefault();toggleDD();ddBtn.focus()}
  });
  ddMenu.addEventListener("keydown",function(e){
    var idx=getActiveIdx();
    if(e.key==="ArrowDown"){e.preventDefault();focusOption(idx+1)}
    else if(e.key==="ArrowUp"){e.preventDefault();focusOption(idx-1)}
    else if(e.key==="Enter"||e.key===" "){e.preventDefault();if(idx>=0)ddOpts[idx].click()}
    else if(e.key==="Escape"){e.preventDefault();if(ddOpen)toggleDD();ddBtn.focus()}
  });

  // --- Yield point 2: after dropdown setup ---
  await yieldToMain();

  /* ===== AVIF SUPPORT DETECTION (deferred to idle time) ===== */
  var avifSupported=false;
  function detectAvif(){
    var tc=document.createElement("canvas");tc.width=1;tc.height=1;
    tc.toBlob(function(blob){
      avifSupported=!!(blob&&blob.type==="image/avif");
      if(avifSupported){
        var avifOpt=document.createElement("div");avifOpt.className="dd__opt";avifOpt.setAttribute("data-val","avif");
        avifOpt.setAttribute("role","option");avifOpt.setAttribute("aria-selected","false");avifOpt.setAttribute("tabindex","-1");
        avifOpt.textContent="AVIF";
        ddMenu.insertBefore(avifOpt,ddMenu.firstChild);
        ddOpts=ddMenu.querySelectorAll(".dd__opt");
        avifOpt.addEventListener("click",function(e){
          e.stopPropagation();
          selectedFormat=avifOpt.getAttribute("data-val");
          ddTxt.textContent=avifOpt.textContent;
          for(var j=0;j<ddOpts.length;j++){ddOpts[j].classList.remove("sel");ddOpts[j].setAttribute("aria-selected","false");ddOpts[j].setAttribute("tabindex","-1")}
          avifOpt.classList.add("sel");avifOpt.setAttribute("aria-selected","true");avifOpt.setAttribute("tabindex","0");
          toggleDD();refreshBtns();
        });
      }
    },"image/avif",0.5);
  }
  if(typeof requestIdleCallback==="function"){
    requestIdleCallback(detectAvif,{timeout:3000});
  }else{
    setTimeout(detectAvif,100);
  }

  /* ===== FILE PICKER ===== */
  function openPicker(){
    var input=document.createElement("input");
    input.type="file";input.setAttribute("multiple","multiple");
    input.setAttribute("accept",ACCEPT.join(",")+","+EXTENSIONS.join(","));
    input.style.display="none";document.body.appendChild(input);
    input.addEventListener("change",function(){
      if(input.files&&input.files.length>0)addFiles(input.files);
      document.body.removeChild(input);
    });input.click();
  }
  dz.addEventListener("click",openPicker);
  dz.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();openPicker()}});
  dz.addEventListener("dragenter",function(e){e.preventDefault();dz.classList.add("ov")});
  dz.addEventListener("dragover",function(e){e.preventDefault();dz.classList.add("ov")});
  dz.addEventListener("dragleave",function(){dz.classList.remove("ov")});
  dz.addEventListener("drop",function(e){e.preventDefault();dz.classList.remove("ov");if(e.dataTransfer&&e.dataTransfer.files)addFiles(e.dataTransfer.files)});

  /* Close any open error tooltip on outside click */
  document.addEventListener("click",function(){
    var tips=document.querySelectorAll(".tile__tip.show");
    for(var i=0;i<tips.length;i++){tips[i].classList.remove("show")}
  });

  // --- Yield point 3: after file picker / drag-drop setup ---
  await yieldToMain();

  function addFiles(fl){
    var added=0;
    for(var i=0;i<fl.length;i++){
      var f=fl[i];if(!isImg(f))continue;
      var dup=false;for(var j=0;j<items.length;j++){if(items[j].file.name===f.name&&items[j].file.size===f.size){dup=true;break}}
      if(dup)continue;
      items.push({id:++nextId,file:f,status:"wait",blob:null,origSize:f.size,newSize:0,thumb:URL.createObjectURL(f),err:null});cntWait++;
      appendTile(items[items.length-1],added);added++;
    }
    if(added){updateInfo();refreshBtns()}
  }

  /* ===== CREATE TILE ===== */
  function appendTile(item,idx){
    var tile=document.createElement("div");tile.className="tile entering";
    var img=document.createElement("img");img.src=item.thumb;img.loading="lazy";img.draggable=false;img.alt=item.file.name;
    var grad=document.createElement("div");grad.className="tile__grad";
    var badge=document.createElement("div");badge.className="tile__badge";

    /* Centered hover overlay */
    var overlay=document.createElement("div");overlay.className="tile__overlay";
    var oPct=document.createElement("div");oPct.className="tile__overlay__pct";
    var oOrig=document.createElement("div");oOrig.className="tile__overlay__row";
    var oArrow=document.createElement("div");oArrow.className="tile__overlay__arrow";oArrow.innerHTML=arrowSvg;
    var oNew=document.createElement("div");oNew.className="tile__overlay__row new";
    overlay.appendChild(oPct);overlay.appendChild(oOrig);overlay.appendChild(oArrow);overlay.appendChild(oNew);

    var bar=document.createElement("div");bar.className="tile__bar tile__bar--wait";
    var spin=document.createElement("div");spin.className="tile__spin";spin.innerHTML=spinIcon;

    var del=document.createElement("button");del.type="button";del.className="tile__del";del.innerHTML=delIcon;del.setAttribute("aria-label","Remove "+item.file.name);
    del.addEventListener("click",function(e){e.stopPropagation();removeItem(item)});

    tile.appendChild(img);tile.appendChild(grad);tile.appendChild(badge);tile.appendChild(overlay);
    tile.appendChild(bar);tile.appendChild(spin);tile.appendChild(del);
    grid.appendChild(tile);

    tileEls.set(item.id,{root:tile,grad:grad,badge:badge,oPct:oPct,oOrig:oOrig,oNew:oNew,bar:bar,spin:spin,errBtn:null,tip:null});

    var delay=Math.min(idx||0,20)*40;
    setTimeout(function(){requestAnimationFrame(function(){tile.classList.remove("entering")})},delay);
  }

  /* ===== UPDATE TILE ===== */
  function updateTile(item){
    var el=tileEls.get(item.id);if(!el)return;
    el.bar.className="tile__bar";el.bar.style.display="";
    if(item.status==="wait")el.bar.classList.add("tile__bar--wait");
    else if(item.status==="run")el.bar.classList.add("tile__bar--run");
    else if(item.status==="ok")el.bar.classList.add("tile__bar--ok");

    if(item.status==="run")el.spin.classList.add("on");else el.spin.classList.remove("on");

    el.root.classList.remove("tile--err","converted");
    el.badge.classList.remove("on","up");

    /* Remove old error elements if they exist */
    if(el.errBtn){el.root.removeChild(el.errBtn);el.errBtn=null}
    if(el.tip){el.root.removeChild(el.tip);el.tip=null}

    if(item.status==="err"){
      el.root.classList.add("tile--err");
      el.bar.style.display="none";
      /* Create error icon + tooltip on demand */
      var errBtn=document.createElement("button");errBtn.type="button";errBtn.className="tile__err";errBtn.innerHTML=errIcon;errBtn.setAttribute("aria-label","Show error for "+item.file.name);errBtn.setAttribute("aria-expanded","false");
      var tip=document.createElement("div");tip.className="tile__tip";tip.textContent=item.err||"Unknown error";
      var tipId="tip-"+item.id;tip.id=tipId;tip.setAttribute("role","tooltip");errBtn.setAttribute("aria-describedby",tipId);
      errBtn.addEventListener("click",function(e){e.stopPropagation();var showing=tip.classList.toggle("show");errBtn.setAttribute("aria-expanded",String(showing))});
      el.root.appendChild(errBtn);el.root.appendChild(tip);
      el.errBtn=errBtn;el.tip=tip;
    }

    if(item.status==="ok"&&item.newSize>0){
      el.root.classList.add("converted");
      var diff=item.origSize-item.newSize;
      var pct=((diff/item.origSize)*100).toFixed(1);
      var absPct=Math.abs(parseFloat(pct));
      if(diff>=0){
        el.badge.textContent="\u2212"+absPct+"%";el.badge.classList.remove("up");
        el.oPct.textContent="\u2212"+absPct+"%";el.oPct.classList.remove("up");
      }else{
        el.badge.textContent="+"+absPct+"%";el.badge.classList.add("up");
        el.oPct.textContent="+"+absPct+"%";el.oPct.classList.add("up");
      }
      el.badge.classList.add("on");
      el.oOrig.textContent=fmt(item.origSize);
      el.oNew.textContent=fmt(item.newSize);
    }
  }

  function updateInfo(){
    if(!items.length){inf.classList.remove("on");return}
    inf.classList.add("on");
    nL.innerHTML='<span class="g">'+items.length+'</span> image'+(items.length!==1?'s':'');
    var p=[];if(cntDone)p.push('<span class="g">'+cntDone+' done</span>');
    if(cntErr)p.push('<span class="a">'+cntErr+' error'+(cntErr!==1?'s':'')+'</span>');
    nR.innerHTML=p.join(' \u00b7 ');
  }
  function refreshBtns(){
    var formatChanged=lastFormat!==null&&lastFormat!==selectedFormat;
    bGo.disabled=!(cntWait>0||(formatChanged&&items.length>0))||running;
    bDl.disabled=!cntDone||running;bClr.disabled=!items.length||running;
  }

  function removeItem(item){
    if(running)return;
    var el=tileEls.get(item.id);
    if(el){grid.removeChild(el.root);tileEls.delete(item.id)}
    if(item.thumb)URL.revokeObjectURL(item.thumb);
    adjCount(item.status,-1);
    var idx=items.indexOf(item);
    if(idx>=0)items.splice(idx,1);
    if(!items.length){lastFormat=null;sm.classList.remove("on")}
    else{showSummary()}
    updateInfo();refreshBtns();
  }

  // --- Yield point 4: after tile management, before button handlers ---
  await yieldToMain();

  /* ===== WEB WORKER POOL (OffscreenCanvas) — lazy-initialized ===== */
  var MAX_CONCURRENCY=navigator.hardwareConcurrency||4;
  var useWorkers=false;
  var workerPool=[],workerBlobUrl=null;
  var workerPoolReady=false;

  function ensureWorkerPool(){
    if(workerPoolReady)return;
    workerPoolReady=true;

    /* Feature-detect: OffscreenCanvas with 2d context + createImageBitmap */
    try{
      if(typeof OffscreenCanvas==="undefined"||typeof createImageBitmap!=="function")return;
      var tc=new OffscreenCanvas(1,1);if(!tc.getContext("2d"))return;
      if(typeof tc.convertToBlob!=="function")return;
    }catch(e){return}

    var code=[
      "self.onmessage=function(e){",
      "var d=e.data,bm=d.bitmap,mime=d.mime,q=d.quality,fw=d.fillWhite;",
      "try{",
      "var c=new OffscreenCanvas(bm.width,bm.height);var ctx=c.getContext('2d');",
      "if(fw){ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,bm.width,bm.height)}",
      "ctx.drawImage(bm,0,0);bm.close();",
      "var opts={type:mime};if(q!==undefined)opts.quality=q;",
      "c.convertToBlob(opts).then(function(blob){",
      "self.postMessage({ok:true,blob:blob})",
      "}).catch(function(err){",
      "self.postMessage({ok:false,error:err.message||'Conversion failed'})",
      "})",
      "}catch(err){self.postMessage({ok:false,error:err.message||'Worker error'})}",
      "};"
    ].join("\n");

    try{
      workerBlobUrl=URL.createObjectURL(new Blob([code],{type:"application/javascript"}));
      for(var i=0;i<MAX_CONCURRENCY;i++){
        var w=new Worker(workerBlobUrl);
        workerPool.push({worker:w,busy:false});
      }
      useWorkers=true;
    }catch(e){/* Workers unavailable — fall back to main thread */}
  }

  // Pre-warm worker pool during idle time
  if(typeof requestIdleCallback==="function"){
    requestIdleCallback(function(){ensureWorkerPool()},{timeout:5000});
  }else{
    setTimeout(function(){ensureWorkerPool()},200);
  }

  function getIdleWorker(){
    for(var i=0;i<workerPool.length;i++){if(!workerPool[i].busy)return workerPool[i]}return null;
  }

  function convertFileWorker(file,format){
    return new Promise(function(resolve){
      createImageBitmap(file).then(function(bitmap){
        var wp=getIdleWorker();
        if(!wp){resolve({ok:false,error:"No idle worker"});bitmap.close();return}
        wp.busy=true;
        var timer=setTimeout(function(){wp.busy=false;resolve({ok:false,error:"Worker timeout"})},30000);
        wp.worker.onmessage=function(e){
          clearTimeout(timer);wp.busy=false;
          resolve(e.data);
        };
        wp.worker.onerror=function(){
          clearTimeout(timer);wp.busy=false;
          resolve({ok:false,error:"Worker error"});
        };
        wp.worker.postMessage({
          bitmap:bitmap,
          mime:outMime(format),
          quality:QUALITY[format],
          fillWhite:format==="jpeg"
        },[bitmap]);
      }).catch(function(err){
        resolve({ok:false,error:err.message||"createImageBitmap failed"});
      });
    });
  }

  /* Main-thread fallback (original approach) */
  function convertFileMain(file,format){
    return new Promise(function(resolve){
      var image=new Image();var url=URL.createObjectURL(file);
      image.onload=function(){
        var w=image.naturalWidth,h=image.naturalHeight;
        var c=document.createElement("canvas");c.width=w;c.height=h;var ctx=c.getContext("2d");
        if(format==="jpeg"){ctx.fillStyle="#FFFFFF";ctx.fillRect(0,0,w,h)}
        ctx.drawImage(image,0,0,w,h);URL.revokeObjectURL(url);
        c.toBlob(function(blob){c.width=0;c.height=0;blob?resolve({ok:true,blob:blob}):resolve({ok:false,error:"Conversion failed"})},outMime(format),QUALITY[format]);
      };
      image.onerror=function(){URL.revokeObjectURL(url);resolve({ok:false,error:"Could not read file"})};
      image.src=url;
    });
  }

  function convertFile(file,format){
    ensureWorkerPool();
    if(useWorkers)return convertFileWorker(file,format);
    return convertFileMain(file,format);
  }

  /* ===== PARALLEL CONVERSION ENGINE ===== */
  bGo.addEventListener("click",async function(){
    if(running)return;running=true;refreshBtns();
    var format=selectedFormat;var reconvert=lastFormat!==null&&lastFormat!==format;var pending=[];
    for(var i=0;i<items.length;i++){if(items[i].status==="wait"||(reconvert&&items[i].status!=="run"))pending.push(items[i])}
    lastFormat=format;
    announce("Converting "+pending.length+" image"+(pending.length!==1?"s":"")+" to "+format.toUpperCase());
    try{
      pg.classList.add("on");setProg("0");

      /* Mark all pending as running */
      for(var m=0;m<pending.length;m++){adjCount(pending[m].status,-1);pending[m].status="run";updateTile(pending[m])}

      var done=0;
      var concurrency=useWorkers?Math.min(MAX_CONCURRENCY,pending.length):1;

      /* Semaphore-based pool: process up to `concurrency` images at once */
      var cursor=0;
      function processNext(){
        if(cursor>=pending.length)return Promise.resolve();
        var idx=cursor++;var it=pending[idx];
        return convertFile(it.file,format).then(function(res){
          if(res.ok){it.status="ok";it.blob=res.blob;it.newSize=res.blob.size;it.fmt=format;adjCount("ok",1)}
          else{it.status="err";it.err=res.error;adjCount("err",1)}
        }).catch(function(){
          it.status="err";it.err="Exception";adjCount("err",1);
        }).then(function(){
          done++;updateTile(it);updateInfo();setProg((done/pending.length*100).toFixed(1));
          return processNext();
        });
      }

      var lanes=[];
      for(var c=0;c<concurrency;c++){lanes.push(processNext())}
      await Promise.all(lanes);

    }finally{
      pg.classList.remove("on");running=false;
      refreshBtns();showSummary();announce(cntDone+" converted, "+cntErr+" error"+(cntErr!==1?"s":""));
    }
  });

  function showSummary(){
    var origT=0,newT=0,n=0;
    for(var i=0;i<items.length;i++){if(items[i].status==="ok"){n++;origT+=items[i].origSize;newT+=items[i].newSize}}
    if(!n){sm.classList.remove("on");return}
    var saved=origT-newT;var pct=origT>0?((saved/origT)*100).toFixed(1):"0";
    document.getElementById("zN").textContent=n;
    document.getElementById("zO").textContent=fmt(origT);
    document.getElementById("zW").textContent=fmt(newT);
    var zS=document.getElementById("zS");
    zS.textContent=(saved>=0?"\u2212":"+")+fmt(Math.abs(saved))+" ("+pct+"%)";
    zS.classList.toggle("sm__v--gain",saved>=0);
    zS.classList.toggle("sm__v--loss",saved<0);
    sm.classList.add("on");
  }

  bDl.addEventListener("click",function(){
    var done=[];for(var i=0;i<items.length;i++){if(items[i].status==="ok"&&items[i].blob)done.push(items[i])}
    if(!done.length)return;
    if(done.length===1){dlOne(done[0]);return}
    mInfo.textContent=done.length+" images converted";prevFocus=document.activeElement;mbg.classList.add("on");dlZipBtn.focus();
  });
  mbg.addEventListener("click",function(e){if(e.target===mbg){mbg.classList.remove("on");if(prevFocus)prevFocus.focus()}});
  document.addEventListener("keydown",function(e){
    if(!mbg.classList.contains("on"))return;
    if(e.key==="Escape"){e.preventDefault();mbg.classList.remove("on");if(prevFocus)prevFocus.focus();return}
    if(e.key==="Tab"){
      var focusable=mbg.querySelectorAll("button:not([disabled])");
      if(!focusable.length)return;
      var first=focusable[0],last=focusable[focusable.length-1];
      if(e.shiftKey){if(document.activeElement===first){e.preventDefault();last.focus()}}
      else{if(document.activeElement===last){e.preventDefault();first.focus()}}
    }
  });

  function dlOne(item){
    var a=document.createElement("a");var url=URL.createObjectURL(item.blob);
    a.href=url;a.download=outName(item.file.name,item.fmt||selectedFormat);
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    setTimeout(function(){URL.revokeObjectURL(url)},2000);
  }
  dlAllBtn.addEventListener("click",async function(){
    mbg.classList.remove("on");
    for(var i=0;i<items.length;i++){if(items[i].status==="ok"&&items[i].blob){dlOne(items[i]);await pause(250)}}
  });
  // Lazy-load JSZip on demand — not needed until user downloads as ZIP
  function loadJSZip(cb){
    if(typeof JSZip!=="undefined")return cb();
    var s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    s.onload=cb;
    s.onerror=function(){alert("Failed to load JSZip library. Please check your connection.")};
    document.head.appendChild(s);
  }
  dlZipBtn.addEventListener("click",async function(){
    mbg.classList.remove("on");
    if(typeof JSZip==="undefined"){loadJSZip(function(){dlZipBtn.click()});return}
    pg.classList.add("on");setProg("0");
    try{
      var zip=new JSZip();var done=[];
      for(var i=0;i<items.length;i++){if(items[i].status==="ok"&&items[i].blob)done.push(items[i])}
      for(var j=0;j<done.length;j++){zip.file(outName(done[j].file.name,done[j].fmt||selectedFormat),done[j].blob);setProg(((j+1)/done.length*50).toFixed(1));await pause(5)}
      setProg("55");
      var content=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:1}},function(m){setProg((55+m.percent*.45).toFixed(1))});
      setProg("100");await pause(200);
      var a=document.createElement("a");var url=URL.createObjectURL(content);
      a.href=url;a.download="converted_images.zip";document.body.appendChild(a);a.click();document.body.removeChild(a);
      setTimeout(function(){URL.revokeObjectURL(url)},3000);
    }finally{
      pg.classList.remove("on");
    }
  });

  bClr.addEventListener("click",function(){
    for(var i=0;i<items.length;i++){if(items[i].thumb)URL.revokeObjectURL(items[i].thumb)}
    items=[];cntWait=0;cntDone=0;cntErr=0;tileEls.clear();grid.innerHTML="";lastFormat=null;
    sm.classList.remove("on");inf.classList.remove("on");pg.classList.remove("on");refreshBtns();
    announce("All images cleared");
  });

})();
