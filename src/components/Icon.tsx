type IconName =
  | "login"
  | "plus"
  | "refresh"
  | "copy"
  | "save"
  | "link"
  | "lock"
  | "power"
  | "receipt"
  | "rotate";

const paths: Record<IconName, string> = {
  login: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3",
  plus: "M12 5v14M5 12h14",
  refresh: "M21 12a9 9 0 0 1-15.3 6.4M3 12A9 9 0 0 1 18.3 5.6M18 3v5h-5M6 21v-5h5",
  copy: "M8 8h10v12H8zM6 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2",
  save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8",
  link: "M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6z",
  power: "M12 2v10M18.4 5.6a9 9 0 1 1-12.8 0",
  receipt: "M7 3h10v18l-2-1-2 1-2-1-2 1-2-1zM9 8h6M9 12h6M9 16h3",
  rotate: "M4 4v6h6M20 20v-6h-6M5 19A9 9 0 0 0 19 5M19 5h-5M5 19h5",
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 24 24" fill="none">
      <path d={paths[name]} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
