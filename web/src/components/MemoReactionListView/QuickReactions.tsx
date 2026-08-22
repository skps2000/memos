import { useInstance } from "@/contexts/InstanceContext";
import { cn } from "@/lib/utils";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { useReactionActions } from "./hooks";

interface Props {
  memo: Memo;
  className?: string;
}

const QUICK_REACTION_COUNT = 5;

// QuickReactions renders the first few configured reactions as one-tap
// buttons so users can react without opening the full reaction picker.
const QuickReactions = (props: Props) => {
  const { memo, className } = props;
  const { memoRelatedSetting } = useInstance();
  const { hasReacted, handleReactionClick } = useReactionActions({ memo });

  const quickReactionTypes = memoRelatedSetting.reactions.slice(0, QUICK_REACTION_COUNT);
  if (quickReactionTypes.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-row items-center", className)}>
      {quickReactionTypes.map((reactionType) => (
        <button
          key={reactionType}
          type="button"
          title={reactionType}
          className={cn(
            "h-6 w-6 flex justify-center items-center rounded-full text-sm transition-colors cursor-pointer",
            hasReacted(reactionType)
              ? "bg-secondary text-secondary-foreground"
              : "opacity-70 hover:bg-secondary/60 hover:opacity-100",
          )}
          onClick={() => handleReactionClick(reactionType)}
        >
          {reactionType}
        </button>
      ))}
    </div>
  );
};

export default QuickReactions;
