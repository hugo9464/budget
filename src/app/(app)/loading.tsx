/** Squelette affiché instantanément pendant le chargement d'une page. */
export default function Loading() {
  return <div className="page page-loading" aria-busy="true" aria-label="Chargement">
    <div className="skeleton skeleton-title"/>
    <div className="skeleton skeleton-subtitle"/>
    <div className="skeleton skeleton-hero"/>
    <div className="skeleton-grid">
      <div className="skeleton skeleton-card"/>
      <div className="skeleton skeleton-card"/>
    </div>
  </div>;
}
