/**
 * Inline bootstrap for the Meta Pixel on jarvi.life.
 *
 * Runs before React hydrates so (1) `_fbc`/`_fbp` exist on `.jarvi.life` and
 * are readable by app.jarvi.life, and (2) PageView fires even if the user
 * bounces before the app bundle loads.
 */
export function getMetaPixelBootstrapScript(pixelId: string): string {
  if (!/^\d+$/.test(pixelId)) return '';

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
    var fbclid=new URLSearchParams(location.search).get('fbclid');
    if(fbclid&&!getCookie('_fbc')){
      document.cookie='_fbc='+encodeURIComponent('fb.1.'+Date.now()+'.'+fbclid)+flags;
    }
    if(!getCookie('_fbp')){
      document.cookie='_fbp='+encodeURIComponent('fb.1.'+Date.now()+'.'+Math.floor(Math.random()*2147483647))+flags;
    }else if(share){
      document.cookie='_fbp='+encodeURIComponent(getCookie('_fbp'))+flags;
    }
    if(share&&getCookie('_fbc')){
      document.cookie='_fbc='+encodeURIComponent(getCookie('_fbc'))+flags;
    }
  }catch(e){}
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  var opts=share?{cookieDomain:'jarvi.life',cookieFlags:'domain=.jarvi.life;samesite=lax'+(location.protocol==='https:'?';secure':'')}:{};
  fbq('init',PIXEL_ID,{},opts);
  fbq('track','PageView');
})();`;
}

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & {
      queue?: unknown[];
      loaded?: boolean;
      version?: string;
    };
    _fbq?: Window['fbq'];
  }
}

export function trackLead(location: string): void {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  const eventId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `lead_${Date.now()}`;
  window.fbq('track', 'Lead', { content_name: location }, { eventID: eventId });
}
