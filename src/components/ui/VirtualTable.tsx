import { ReactNode, useMemo } from 'react';
import { FixedSizeList } from 'react-window';
import clsx from 'clsx';

export type Column<T> = {
  header: ReactNode;
  width: string;
  align?: 'left' | 'right' | 'center';
  cell: (row: T, index: number) => ReactNode;
  headerClass?: string;
  cellClass?: string;
};

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T, index: number) => string | number;
  rowHeight?: number;
  height?: number;
  empty?: ReactNode;
  footer?: ReactNode;
  onRowClick?: (row: T, index: number) => void;
  className?: string;
};

const alignClass = (a?: 'left' | 'right' | 'center') =>
  a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

export function VirtualTable<T>({
  rows, columns, rowKey, rowHeight = 32, height = 480, empty, footer, onRowClick, className,
}: Props<T>) {
  const gridTemplate = useMemo(() => columns.map((c) => c.width).join(' '), [columns]);

  if (rows.length === 0) {
    return (
      <div className={className}>
        <HeaderRow columns={columns} gridTemplate={gridTemplate} />
        <div className="py-8 text-center text-primary-500 text-sm">{empty ?? 'Aucune donnée'}</div>
      </div>
    );
  }

  return (
    <div className={className}>
      <HeaderRow columns={columns} gridTemplate={gridTemplate} />
      <FixedSizeList
        height={Math.min(height, rows.length * rowHeight)}
        width="100%"
        itemCount={rows.length}
        itemSize={rowHeight}
      >
        {({ index, style }) => {
          const row = rows[index];
          return (
            <div
              style={style}
              key={rowKey(row, index)}
              onClick={onRowClick ? () => onRowClick(row, index) : undefined}
              className={clsx(
                'grid items-center border-b border-primary-200 dark:border-primary-800 text-sm',
                onRowClick && 'cursor-pointer hover:bg-primary-100/50 dark:hover:bg-primary-900/50',
              )}
            >
              <div className="contents" style={{ display: 'contents' }}>
                <div className="grid w-full" style={{ gridTemplateColumns: gridTemplate }}>
                  {columns.map((col, ci) => (
                    <div key={ci} className={clsx('py-1.5 px-3 truncate', alignClass(col.align), col.cellClass)}>
                      {col.cell(row, index)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        }}
      </FixedSizeList>
      {footer && (
        <div
          className="grid border-t-2 border-primary-300 dark:border-primary-700 bg-primary-100 dark:bg-primary-900 font-bold text-sm"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

function HeaderRow<T>({ columns, gridTemplate }: { columns: Column<T>[]; gridTemplate: string }) {
  return (
    <div
      className="grid text-xs uppercase tracking-wider text-primary-500 border-b border-primary-300 dark:border-primary-700 bg-primary-100 dark:bg-primary-900 sticky top-0 z-10"
      style={{ gridTemplateColumns: gridTemplate }}
    >
      {columns.map((c, i) => (
        <div key={i} className={clsx('py-2 px-3', alignClass(c.align), c.headerClass)}>{c.header}</div>
      ))}
    </div>
  );
}
