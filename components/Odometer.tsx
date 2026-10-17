"use client";
import { memo } from "react";

const DIGITS = "0123456789";

/**
 * Mechanical odometer: each digit is a vertical strip that physically rolls
 * to its new position (train departure-board style). Non-digits render static.
 */
function OdometerImpl({ value, className, label }: { value: string; className?: string; label?: string }) {
  return (
    <span className={`odo ${className ?? ""}`} aria-label={label ?? value} role="text">
      {value.split("").map((ch, i) => {
        const d = DIGITS.indexOf(ch);
        if (d === -1)
          return (
            <span key={`s${i}-${ch}`} className="odo-static" aria-hidden="true">
              {ch}
            </span>
          );
        return (
          <span key={`d${value.length - i}`} className="odo-col" aria-hidden="true">
            <span className="odo-strip" style={{ transform: `translateY(-${d}em)` }}>
              {DIGITS.split("").map((n) => (
                <span key={n}>{n}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}

export const Odometer = memo(OdometerImpl);
