import type { Metadata } from "next";
import { saveCategory } from "@/app/actions";
import { getAllCategories } from "@/lib/data";
import { Icon } from "@/components/icon";

export const metadata: Metadata = { title: "Catégories" };

export default async function CategoriesPage() {
  const categories = await getAllCategories();
  return <div className="page"><header className="page-header"><div><p className="eyebrow">ORGANISATION</p><h1>Catégories</h1><p className="muted">Personnalisez les couleurs et libellés utilisés pour votre budget.</p></div></header>
    <section className="categories-grid">{categories.map((category) => <form action={saveCategory} className="category-card card" key={category.id}><input type="hidden" name="id" value={category.id}/><div className="category-dot large" style={{ background: `${category.color}20`, color: category.color }}><Icon name={category.icon}/></div><div><input className="category-name-input" name="name" defaultValue={category.name} aria-label={`Nom de ${category.name}`}/><span>{category.kind === "income" ? "Revenu" : category.kind === "transfer" ? "Hors budget" : category.kind === "uncategorized" ? "À vérifier" : "Dépense"}</span></div><input className="color-input" type="color" name="color" defaultValue={category.color} aria-label={`Couleur de ${category.name}`}/><input type="hidden" name="icon" value={category.icon}/><button className="icon-button" aria-label={`Enregistrer ${category.name}`}><Icon name="chevron"/></button></form>)}</section>
    <form action={saveCategory} className="new-category card"><div className="category-dot large"><Icon name="plus"/></div><div><h2>Nouvelle catégorie</h2><p className="muted">Ajoutez une enveloppe adaptée à vos habitudes.</p></div><input name="name" placeholder="Nom de la catégorie" required/><input type="color" name="color" defaultValue="#7357FF"/><input type="hidden" name="icon" value="dots"/><button className="primary-button"><Icon name="plus"/>Ajouter</button></form>
  </div>;
}
