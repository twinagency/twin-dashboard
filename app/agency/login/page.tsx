import AgencyLoginForm from "./AgencyLoginForm";
export const metadata = { title: "Agency sign in · Flirt" };
export default async function AgencyLogin({searchParams}:{searchParams:Promise<{error?:string}>}) {
 const {error}=await searchParams;
 return <main className="flirt-agency-login"><section className="flirt-agency-story">
 <img src="/brand/flirt-wordmark-master.png" alt="flirt" className="flirt-agency-logo inverse" />
 <div><p className="flirt-eyebrow">Your agency. A little closer.</p><h1>Room to grow.<br/>Ready when you are.</h1><p>Your creators, conversations and earnings in one place.</p></div>
 <span>FLIRT / AGENCY WORKSPACE</span></section>
 <section className="flirt-agency-signin"><div className="flirt-agency-card">
 <img src="/brand/flirt-icon-master.jpg" alt="" className="flirt-agency-icon" />
 <h2>Welcome back.</h2><p>Sign in to your agency workspace.</p>
 <AgencyLoginForm error={!!error}/></div></section></main>;
}
