import React from "react";
import "./TopLoadingBar.css";

export default function TopLoadingBar({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div
      className="mina-top-loading"
      role="progressbar"
      aria-label="Loading"
      aria-busy="true"
    />
  );
}
