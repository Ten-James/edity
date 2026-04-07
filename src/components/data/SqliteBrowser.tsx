import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { IconPlayerPlay, IconTable } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type {
  SqliteTableInfo,
  SqliteColumnInfo,
  SqliteQueryResult,
} from "@shared/types/data";

interface SqliteBrowserProps {
  tables: SqliteTableInfo[];
  columns: SqliteColumnInfo[];
  selectedTable: string | null;
  queryResult: SqliteQueryResult | null;
  queryError: string | null;
  onLoadTables: () => Promise<void>;
  onSelectTable: (table: string) => Promise<void>;
  onExecuteQuery: (sql: string) => Promise<void>;
}

export function SqliteBrowser({
  tables,
  columns,
  selectedTable,
  queryResult,
  queryError,
  onLoadTables,
  onSelectTable,
  onExecuteQuery,
}: SqliteBrowserProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    // Load table list on mount; the parent's onLoadTables identity is unstable.
    onLoadTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update query template when the selected table changes.
  const [prevSelectedTable, setPrevSelectedTable] = useState(selectedTable);
  if (selectedTable !== prevSelectedTable) {
    setPrevSelectedTable(selectedTable);
    if (selectedTable) {
      setQuery(`SELECT * FROM "${selectedTable}" LIMIT 100`);
    }
  }

  function handleRun() {
    if (query.trim()) onExecuteQuery(query);
  }

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      {/* Table list */}
      <div className="flex flex-col w-56 border-r border-border shrink-0">
        <div className="flex items-center px-3 py-2 border-b border-border shrink-0">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Tables
          </span>
        </div>
        <ScrollArea className="flex-1">
          {tables.map((t) => (
            <div
              key={t.name}
              onClick={() => onSelectTable(t.name)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-accent/50 transition-colors",
                selectedTable === t.name && "bg-accent",
              )}
            >
              <IconTable size={12} className="shrink-0 text-muted-foreground" />
              <span className="text-xs truncate flex-1">{t.name}</span>
              <span className="text-[10px] text-muted-foreground">
                {t.rowCount}
              </span>
            </div>
          ))}
          {tables.length === 0 && (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
              No tables
            </div>
          )}
        </ScrollArea>

        {/* Column inspector */}
        {selectedTable && columns.length > 0 && (
          <div className="border-t border-border">
            <div className="px-3 py-1.5 border-b border-border">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Columns
              </span>
            </div>
            <ScrollArea className="max-h-40">
              {columns.map((col) => (
                <div
                  key={col.name}
                  className="flex items-center gap-2 px-3 py-1"
                >
                  <span className="text-xs truncate flex-1">{col.name}</span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    {col.type || "ANY"}
                  </Badge>
                  {col.pk && (
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1 py-0 bg-primary/10 text-primary"
                    >
                      PK
                    </Badge>
                  )}
                </div>
              ))}
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Query area + results */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Query input */}
        <div className="flex items-start gap-2 p-2 border-b border-border shrink-0">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                handleRun();
              }
            }}
            placeholder="SELECT * FROM ..."
            rows={3}
            className="flex-1 bg-muted rounded-md px-3 py-2 text-xs font-mono resize-none outline-none focus:ring-1 focus:ring-primary"
          />
          <Button
            variant="default"
            size="xs"
            onClick={handleRun}
            disabled={!query.trim()}
          >
            <IconPlayerPlay size={12} />
            Run
          </Button>
        </div>

        {queryError && (
          <div className="px-3 py-2 text-xs text-destructive bg-destructive/10 border-b border-border">
            {queryError}
          </div>
        )}

        {/* Results table */}
        {queryResult && queryResult.columns.length > 0 && (
          <ScrollArea className="flex-1">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="sticky top-0 bg-muted">
                    {queryResult.columns.map((col) => (
                      <th
                        key={col}
                        className="border border-border px-3 py-1.5 text-left font-semibold whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queryResult.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-accent/30">
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          className="border border-border px-3 py-1 whitespace-nowrap max-w-xs truncate font-mono"
                        >
                          {cell === null ? (
                            <span className="text-muted-foreground italic">
                              NULL
                            </span>
                          ) : (
                            String(cell)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border">
              {queryResult.rowCount} row{queryResult.rowCount !== 1 ? "s" : ""}
              {queryResult.changes !== undefined &&
                ` · ${queryResult.changes} change${queryResult.changes !== 1 ? "s" : ""}`}
            </div>
          </ScrollArea>
        )}

        {queryResult &&
          queryResult.columns.length === 0 &&
          queryResult.changes !== undefined && (
            <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
              Query executed. {queryResult.changes} row
              {queryResult.changes !== 1 ? "s" : ""} affected.
            </div>
          )}

        {!queryResult && !queryError && (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            {selectedTable
              ? "Press Run or Cmd+Enter to execute query"
              : "Select a table to browse"}
          </div>
        )}
      </div>
    </div>
  );
}
