const paths: Record<string, string> = {
  backups: "M20 6c0 2-4 3-8 3S4 8 4 6s4-3 8-3 8 1 8 3z M4 6v12c0 2 4 3 8 3s8-1 8-3V6 M4 12c0 2 4 3 8 3s8-1 8-3",
  pricing: "M3 3h9l9 9-9 9-9-9z M7 7h.01 M11 12l4 4 M13 10l4 4",
  overview: "M3 3h7v7H3z M14 3h7v4h-7z M14 11h7v10h-7z M3 14h7v7H3z",
  cards: "M7 3h13v17H7z M4 7H2v15h13 M10 7h7 M10 11h7 M10 15h4",
  stock: "M3 9l9-6 9 6v12H3z M7 21V11h10v10 M7 15h10 M7 18h10",
  sealed: "M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10 M7 5l10 4",
  custom: "M6 3h9l3 3v15H6z M15 3v3h3 M12 10l1.3 2.6 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4z",
  accessories: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M8 8h.01 M16 8h.01 M12 12h.01 M8 16h.01 M16 16h.01",
  orders: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 7h6 M9 11h6 M9 15h4",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-3a7 7 0 0 1 14 0v3 M17 4a4 4 0 0 1 0 7 M22 21v-3a7 7 0 0 0-4-6",
  stores: "M3 9l2-6h14l2 6 M3 9v3h18V9 M5 12v9h14v-9 M9 21v-6h6v6 M8 3l-1 6 M16 3l1 6",
  storefront: "M3 3h18v18H3z M3 8h18 M9 8v13 M12 12h6 M12 16h6",
  sets: "M3 5h7l2 3h9v12H3z M6 2h6l2 3h4",
};
export default function NavigationIcon({name}:{name:string}) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
