// 「相似与搭档」 logo: a fedora pulled over one watchful eye. Drawn for Lydia (filled, currentColor,
// 24×24 grid) so it stays legible from 16px up; the gaps between crown, brim and eye are open space.
export default function DetectiveIcon({size=22,title}){
 return <svg className="kw-detective" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden={title?undefined:true} role={title?'img':undefined}>
  {title&&<title>{title}</title>}
  {/* crown, with the dent on top */}
  <path d="M7.3 8.9C7.5 6.5 8 4.5 9.4 4.1c1-.3 1.7.5 2.6.5s1.6-.8 2.6-.5c1.4.4 1.9 2.4 2.1 4.8z"/>
  {/* brim, tilted slightly like a hat seen from the front */}
  <path d="M1.8 11.3c0-1 4.6-1.3 10.2-1.3s10.2.3 10.2 1.3c0 1.1-4.6 1.8-10.2 1.8S1.8 12.4 1.8 11.3z"/>
  {/* the eye under the brim: a ring cut off at the brim, and its pupil */}
  <path d="M7.9 14A5.2 5.2 0 1 0 16.1 14h-2.45A3.6 3.6 0 1 1 10.35 14z"/>
  <circle cx="11.4" cy="17.9" r="1.9"/>
 </svg>;
}
