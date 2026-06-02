import Script from "next/script";
import { env } from "./env";

export function Analytics() {
  return (
    <>
      {env.NEXT_PUBLIC_GA_ID ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${env.NEXT_PUBLIC_GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${env.NEXT_PUBLIC_GA_ID}');`}
          </Script>
        </>
      ) : null}
      {env.NEXT_PUBLIC_META_PIXEL_ID ? (
        <Script id="meta" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${env.NEXT_PUBLIC_META_PIXEL_ID}'); fbq('track', 'PageView');`}
        </Script>
      ) : null}
    </>
  );
}
