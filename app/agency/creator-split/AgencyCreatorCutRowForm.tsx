"use client";

import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { saveAgencyCreatorCut } from "./actions";
import { useState } from "react";

interface CreatorCutRow {
  cloneId: string;
  name: string;
  cutPct: number | null;
}

export default function AgencyCreatorCutRowForm({ row }: { row: CreatorCutRow }) {
  const [inputValue, setInputValue] = useState<string>(row.cutPct !== null ? String(row.cutPct) : "");
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const pct = inputValue === "" ? null : parseInt(inputValue, 10);
      await saveAgencyCreatorCut(row.cloneId, pct);
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
      await saveAgencyCreatorCut(row.cloneId, null);
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
      <TableCell>{row.cutPct !== null ? `${row.cutPct}%` : "Not set (0%)"}</TableCell>
      <TableCell>
        <input
          type="number"
          min="0"
          max="80"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="0-80"
          disabled={isLoading}
          className="w-20 rounded border border-white/20 bg-white/5 px-2 py-1 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none disabled:opacity-50"
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
