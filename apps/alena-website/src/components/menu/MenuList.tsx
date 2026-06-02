import { MenuItemCard, type MenuItemData } from "./MenuItemCard";

type Category = { _id: string; name: string; slug?: { current: string } };
type ItemWithCategory = MenuItemData & { category?: { _id: string } };

export function MenuList({ categories, items }: { categories: Category[]; items: ItemWithCategory[] }) {
  return (
    <div className="space-y-12">
      {categories.map((cat) => {
        const inCat = items.filter((i) => i.category?._id === cat._id);
        if (!inCat.length) return null;
        return (
          <section key={cat._id} id={cat.slug?.current}>
            <h2 className="mb-6 font-display text-3xl text-olive">{cat.name}</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {inCat.map((item) => (
                <MenuItemCard key={item._id} item={item} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
