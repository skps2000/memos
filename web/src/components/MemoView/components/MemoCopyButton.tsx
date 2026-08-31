import copy from "copy-to-clipboard";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslate } from "@/utils/i18n";

const COPIED_FEEDBACK_DURATION = 1500;

interface MemoCopyButtonProps {
  content: string;
}

/** Copies the raw memo content (the original markdown, not the rendered output) in one click. */
const MemoCopyButton: React.FC<MemoCopyButtonProps> = ({ content }) => {
  const t = useTranslate();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleCopy = useCallback(() => {
    copy(content);
    toast.success(t("message.succeed-copy-content"));
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_DURATION);
  }, [content, t]);

  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon" className="size-4" aria-label={t("memo.copy-content")} onClick={handleCopy} />}
      >
        {copied ? <CheckIcon className="text-primary" /> : <CopyIcon className="text-muted-foreground" />}
      </TooltipTrigger>
      <TooltipContent>{t("memo.copy-content")}</TooltipContent>
    </Tooltip>
  );
};

export default MemoCopyButton;
