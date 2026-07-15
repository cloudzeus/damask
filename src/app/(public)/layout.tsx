export default function PublicLayout({ children }: { children: React.ReactNode }) {
  // app-canvas--deep: αρχικά gradient stops του mockup (22%/52%) — το hero
  // ακουμπά ανοιχτό κείμενο απευθείας στον καμβά και θέλει βαθύτερη σκοτεινή ζώνη.
  return <div className="app-canvas app-canvas--deep">{children}</div>
}
