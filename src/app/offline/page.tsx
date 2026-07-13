import Link from "next/link";
import { Icon } from "@/components/icon";

export default function OfflinePage() {
  return <main className="unlock-page"><div className="unlock-card"><div className="unlock-icon"><Icon name="refresh"/></div><h1>Vous êtes hors ligne</h1><p className="muted">Les données financières ne sont volontairement pas conservées hors ligne.</p><Link className="primary-button" href="/">Réessayer</Link></div></main>;
}
