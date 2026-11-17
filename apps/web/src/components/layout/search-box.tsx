import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Tag } from "lucide-react";
import { useSuggestions } from "@/features/catalog/api";
import { useDebounced } from "@/hooks/use-debounced";
import { cn } from "@/lib/cn";

export function SearchBox({
  className,
  onDone,
  tour,
}: {
  className?: string;
  onDone?: () => void;
  tour?: string;
}) {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);

  const debounced = useDebounced(text, 200);
  const { data: suggestions = [] } = useSuggestions(debounced);
  const showList = open && text.trim().length >= 2 && suggestions.length > 0;

  // close when clicking elsewhere
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const go = (to: string) => {
    setOpen(false);
    setText("");
    onDone?.();
    navigate(to);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const picked = suggestions[active];
    if (picked)
      return go(picked.type === "product" ? `/product/${picked.slug}` : `/shop/${picked.slug}`);
    if (text.trim()) go(`/shop?q=${encodeURIComponent(text.trim())}`);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!showList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1));
    } else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={box} data-tour={tour} className={cn("relative", className)}>
      <form onSubmit={submit} role="search">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="Search sofas, lamps, tables…"
          aria-label="Search products"
          role="combobox"
          aria-expanded={showList}
          aria-controls="search-suggestions"
          aria-autocomplete="list"
          className="h-10 w-full rounded-full border border-line bg-white pl-10 pr-4 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </form>

      {showList && (
        <ul
          id="search-suggestions"
          role="listbox"
          className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-2xl border border-line bg-white py-1.5 shadow-xl"
        >
          {suggestions.map((s, i) => (
            <li key={`${s.type}-${s.slug}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(s.type === "product" ? `/product/${s.slug}` : `/shop/${s.slug}`)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm",
                  i === active && "bg-brand-soft",
                )}
              >
                {s.type === "category" ? (
                  <Tag className="size-4 text-gold" aria-hidden />
                ) : (
                  <Search className="size-4 text-muted" aria-hidden />
                )}
                <span className="flex-1 truncate">{s.label}</span>
                {s.type === "category" && <span className="text-xs text-muted">Category</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
