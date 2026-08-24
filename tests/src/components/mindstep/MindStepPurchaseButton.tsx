"use client";

import { useState } from "react";
import { Check, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePiAuth } from "@/lib/pi/client";

export function MindStepPurchaseButton() {
  const { sdk, products, restoredPurchases } = usePiAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Find the product by matching the slug from Pi products list.
  // The product slug from Pi Platform determines which product the user purchases.
  const product = products.length > 0 ? products[0] : null;
  const amount = product?.price_in_pi;
  const quantity =
    restoredPurchases?.purchases?.find((p) => p.productId === product?.slug)?.quantity ?? 0;

  async function purchase() {
    if (!product || !sdk?.makePurchase || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await sdk.makePurchase(product.slug);
      if (result.ok) {
        setMessage("Purchase complete. MindStep is ready for you.");
      } else {
        setMessage("We could not complete that purchase.");
      }
    } catch (error) {
      const code = (error as { code?: string })?.code;
      setMessage(
        code === "purchase_cancelled"
          ? "Purchase cancelled."
          : code === "product_not_found"
            ? "This product is currently unavailable."
            : "Purchase failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  // If no product data is available (Pi APIs not configured, not in Pi Browser,
  // or products endpoint returned empty), render nothing — the Dashboard
  // must still render normally.
  if (!product) {
    return null;
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary p-2 text-primary-foreground">
          <CreditCard className="size-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{product.name}</p>
          <p className="text-xs text-muted-foreground">
            {product.description ?? "Your calm productivity companion"}
          </p>
        </div>
        <Button
          onClick={purchase}
          disabled={!sdk?.makePurchase || busy}
          size="sm"
          className="shrink-0"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Check className="size-4" aria-hidden />
          )}
          <span className="ms-1">{amount} Pi</span>
        </Button>
      </div>
      {quantity > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">Restored purchases: {quantity}</p>
      ) : null}
      {message ? (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
