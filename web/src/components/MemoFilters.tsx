import { isEqual } from "lodash-es";
import {
  BookmarkIcon,
  CalendarIcon,
  CheckCircleIcon,
  CodeIcon,
  EyeIcon,
  HashIcon,
  LayoutListIcon,
  LinkIcon,
  LucideIcon,
  MapPinIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterFactor, getMemoFilterKey, MemoFilter, useMemoFilterContext } from "@/contexts/MemoFilterContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useMemoViews } from "@/hooks/useUserQueries";
import { getBuiltinMemoView, getMemoViewId } from "@/lib/memo-views";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";

interface FilterConfig {
  icon: LucideIcon;
  getLabel: (value: string, t: ReturnType<typeof useTranslate>) => string;
}

const FILTER_CONFIGS: Record<FilterFactor, FilterConfig> = {
  tagSearch: {
    icon: HashIcon,
    getLabel: (value) => value,
  },
  visibility: {
    icon: EyeIcon,
    getLabel: (value) => value,
  },
  contentSearch: {
    icon: SearchIcon,
    getLabel: (value) => value,
  },
  displayTime: {
    icon: CalendarIcon,
    getLabel: (value) => value,
  },
  pinned: {
    icon: BookmarkIcon,
    getLabel: (value) => value,
  },
  "property.hasLink": {
    icon: LinkIcon,
    getLabel: (_, t) => t("memo.filters.has-link"),
  },
  "property.hasTaskList": {
    icon: CheckCircleIcon,
    getLabel: (_, t) => t("memo.filters.has-task-list"),
  },
  "property.hasCode": {
    icon: CodeIcon,
    getLabel: (_, t) => t("memo.filters.has-code"),
  },
  "property.hasLocation": {
    icon: MapPinIcon,
    getLabel: (_, t) => t("memo.filters.has-location"),
  },
};

const CHIP_CLASSES =
  "group inline-flex items-center gap-1.5 h-7 px-2.5 bg-accent/50 hover:bg-accent border border-border/50 rounded-full text-sm transition-all duration-200 hover:shadow-sm";

const MemoFilters = ({ className }: { className?: string }) => {
  const t = useTranslate();
  const currentUser = useCurrentUser();
  const { filters, removeFilter, memoView, setMemoView } = useMemoFilterContext();
  const { data: memoViews = [] } = useMemoViews(currentUser?.name);

  // The selected view narrows the list like any filter, so it gets a chip with the same
  // dismiss affordance instead of being visible only as a highlighted sidebar row.
  const builtinView = getBuiltinMemoView(memoView);
  const savedView = builtinView ? undefined : memoViews.find((view) => getMemoViewId(view.name) === memoView);
  const viewChip = builtinView
    ? { icon: builtinView.icon, label: t(builtinView.labelKey) }
    : savedView
      ? { icon: LayoutListIcon, label: savedView.title }
      : undefined;

  const handleRemoveFilter = (filter: MemoFilter) => {
    removeFilter((f: MemoFilter) => isEqual(f, filter));
  };

  const getFilterDisplayText = (filter: MemoFilter): string => {
    const config = FILTER_CONFIGS[filter.factor];
    if (!config) {
      return filter.value || filter.factor;
    }
    return config.getLabel(filter.value, t);
  };

  if (filters.length === 0 && !viewChip) {
    return null;
  }

  return (
    <div className={cn("w-full flex flex-row justify-start items-center flex-wrap gap-2", className)}>
      {viewChip && (
        <div className={CHIP_CLASSES}>
          <viewChip.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-foreground/80 font-medium max-w-32 truncate">{viewChip.label}</span>
          <span className="ml-0.5 -mr-1">
            <Button variant="ghost" size="icon-sm" onClick={() => setMemoView(undefined)} aria-label="Remove view">
              <XIcon className="w-3 h-3" />
            </Button>
          </span>
        </div>
      )}
      {filters.map((filter) => {
        const config = FILTER_CONFIGS[filter.factor];
        const Icon = config?.icon;

        return (
          <div key={getMemoFilterKey(filter)} className={CHIP_CLASSES}>
            {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
            <span className="text-foreground/80 font-medium max-w-32 truncate">{getFilterDisplayText(filter)}</span>
            <span className="ml-0.5 -mr-1">
              <Button variant="ghost" size="icon-sm" onClick={() => handleRemoveFilter(filter)} aria-label="Remove filter">
                <XIcon className="w-3 h-3" />
              </Button>
            </span>
          </div>
        );
      })}
    </div>
  );
};

MemoFilters.displayName = "MemoFilters";

export default MemoFilters;
