"use client";

import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { saveCut } from "./actions";
import { useState } from "react";

interface CutRow {
  kind: "agency" | "clone";
  id: string;
  name: string;
  cutPct: number | null;
  usdPerStar: number | null;
}

export default function CutRowForm({ row }: { row: CutRow }) {
  const [inputValue, setInputValue] = useState<string>(row.cutPct !== null ? String(row.cutPct) : "");
  const [rateValue, setRateValue] = useState<string>(row.usdPerStar !== null ? String(row.usdPerStar) : "");
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const pct = inputValue === "" ? null : parseInt(inputValue, 10);
      const target = row.kind === "agency" ? { agencyId: row.id } : { cloneId: row.id };
      const rate = rateValue === "" ? null : Number(rateValue);
      await saveCut(target, pct, "manual", rate);
    } catch (error) {
      console.error("Error saving cut:", error);
      alert(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async () => {
    setIsLoading(true);
    try {
      setInputValue("");
      setRateValue("");
      const target = row.kind === "agency" ? { agencyId: row.id } : { cloneId: row.id };
      await saveCut(target, null, "manual");
    } catch (error) {
      console.error("Error clearing cut:", error);
      alert(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell>{row.cutPct !== null ? `${row.cutPct}%` : "Not set (0%)"}{row.usdPerStar !== null ? `, $${row.usdPerStar}/star` : ""}</TableCell>
      <TableCell>
        <input
          type="number"
          min="2"
          max="60"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="2-60"
          disabled={isLoading}
          className="w-20 rounded border border-line bg-white px-2 py-1 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none disabled:opacity-50"
        />
      </TableCell>
      <TableCell>
        <input
          type="number"
          min="0.001"
          max="0.09"
          step="0.001"
          value={rateValue}
          onChange={(e) => setRateValue(e.target.value)}
          placeholder="0.013"
          disabled={isLoading}
          className="w-24 rounded border border-line bg-white px-2 py-1 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none disabled:opacity-50"
        />
      </TableCell>
      <TableCell>
        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={isLoading}
            size="sm"
            variant="default"
          >
            Save
          </Button>
          <Button
            onClick={handleClear}
            disabled={isLoading}
            size="sm"
            variant="outline"
          >
            Clear
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
