"use client";

import { useState } from "react";
import LanguageSwitcher from "./LanguageSwitcher";

export default function HeaderLanguage() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-center p-2 rounded-lg text-text-muted hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5 transition-all"
        title="Language"
        data-i18n-skip="true"
      >
        <span className="material-symbols-outlined text-[20px]">language</span>
      </button>

      <LanguageSwitcher
        hideTrigger
        isOpen={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
