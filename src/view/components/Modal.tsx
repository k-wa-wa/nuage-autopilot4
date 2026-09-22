import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ComponentChildren;
  boxClass?: string;
  children?: ComponentChildren;
}

/** `<dialog>` を open prop で制御する。Esc・背景クリック・× ボタンはいずれも onClose に集約。 */
export function Modal({ open, onClose, title, boxClass, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: キーボードでは dialog 標準の Esc で閉じられる
    <dialog
      ref={ref}
      class="modal"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div class={boxClass ? `modal-box ${boxClass}` : "modal-box"}>
        <div class="modal-header">
          <h2>{title}</h2>
          <button type="button" class="close-btn" aria-label="閉じる" onClick={onClose}>
            &times;
          </button>
        </div>
        <div class="modal-body">{children}</div>
      </div>
    </dialog>
  );
}
