import { Code, ConnectError } from "@connectrpc/connect";
import { useEffect } from "react";
import { toast } from "react-hot-toast";
import { useLocation } from "react-router-dom";
import useNavigateTo from "@/hooks/useNavigateTo";
import { AUTH_REASON_PROTECTED_MEMO, buildAuthRoute } from "@/utils/auth-redirect";

interface UseMemoDetailErrorOptions {
  error: Error | null;
}

const useMemoDetailError = ({ error }: UseMemoDetailErrorOptions) => {
  const navigateTo = useNavigateTo();
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    if (!error) {
      return;
    }

    if (error instanceof ConnectError) {
      // UNAUTHENTICATED means the memo is there and wants a signed-in reader — a private
      // or protected memo opened from a copied permalink, or a session that has lapsed.
      // Answering that with /404 tells the owner their own link is broken, so send them
      // to sign in and back to the memo. NOT_FOUND and PERMISSION_DENIED are answers that
      // signing in will not change, and both stay on /404 so neither confirms the memo exists.
      if (error.code === Code.Unauthenticated) {
        navigateTo(buildAuthRoute({ redirect: `${pathname}${search}${hash}`, reason: AUTH_REASON_PROTECTED_MEMO }), { replace: true });
        return;
      }

      if (error.code === Code.PermissionDenied || error.code === Code.NotFound) {
        navigateTo("/404", { replace: true });
        return;
      }

      toast.error(error.message);
      return;
    }

    toast.error(error.message);
  }, [error, hash, navigateTo, pathname, search]);
};

export default useMemoDetailError;
