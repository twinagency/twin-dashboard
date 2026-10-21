/** Stream immediately inside the existing shell while the server reads a page. */
export default function PageLoading() {
  return <div className="page-loading" aria-busy="true" data-page-loading>
    <p role="status"><span className="page-loading-spinner" aria-hidden="true" />Loading page…</p>
    <div className="page-loading-heading" aria-hidden="true" />
    <div className="page-loading-cards" aria-hidden="true"><div /><div /><div /></div>
    <div className="page-loading-panel" aria-hidden="true" />
  </div>;
}
