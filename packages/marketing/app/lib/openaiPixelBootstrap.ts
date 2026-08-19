/**
 * Inline bootstrap for the OpenAI Ads Measurement Pixel on jarvi.life.
 *
 * Captures `oppref` early and writes `__oppref` on `.jarvi.life` so the hop
 * to app.jarvi.life can reuse the ChatGPT click reference.
 */

export const DEFAULT_OPENAI_PIXEL_ID = '5szZUPcYMs17mumdMe8uLg';

export function getOpenAiPixelBootstrapScript(pixelId: string): string {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(pixelId)) return '';

  return `(function(){
  var PIXEL_ID='${pixelId}';
  var host=location.hostname;
  var share=host==='jarvi.life'||host.slice(-11)==='.jarvi.life';
  var domain=share?'; domain=.jarvi.life':'';
  var secure=location.protocol==='https:'?'; secure':'';
  var flags='; path=/; max-age=7776000; samesite=lax'+secure+domain;
  function getCookie(name){
    var m=document.cookie.match(new RegExp('(?:^|; )'+name+'=([^;]*)'));
    return m?decodeURIComponent(m[1]):'';
  }
  try{
    var oppref=new URLSearchParams(location.search).get('oppref')||getCookie('__oppref');
    if(oppref){
      document.cookie='__oppref='+encodeURIComponent(oppref)+flags;
    }
  }catch(e){}
  (function(w,d,s,u){
    if(w.oaiq)return;
    var q=function(){q.q.push(arguments)};
    q.q=[];
    w.oaiq=q;
    var js=d.createElement(s);
    js.async=true;
    js.src=u;
    var f=d.getElementsByTagName(s)[0];
    f.parentNode.insertBefore(js,f);
  })(window,document,'script','https://bzrcdn.openai.com/sdk/oaiq.min.js');
  oaiq('init',{pixelId:PIXEL_ID});
})();`;
}
