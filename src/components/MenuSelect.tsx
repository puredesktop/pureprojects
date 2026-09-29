import React, { useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { ToolbarSelect } from '@purescience/platform-ui/components/common/containers/AppChrome'
import {
  SelectMenu,
  SelectMenuItem,
} from '@purescience/platform-ui/components/common/dropdown/SelectMenu'

export interface MenuSelectOption<T extends string> {
  value: T
  label: string
}

/**
 * A toolbar choice drawn with the platform menu, not a native <select>:
 * the button shows the current option, the menu lists the rest.
 */
export function MenuSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  /** Accessible name, e.g. "Sort projects". */
  label: string
  value: T
  options: MenuSelectOption<T>[]
  onChange: (value: T) => void
}): React.ReactElement {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const current = options.find(option => option.value === value)
  return (
    <>
      <ToolbarSelect
        ref={anchor}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {current?.label ?? label}
        <ChevronDown size={12} aria-hidden="true" />
      </ToolbarSelect>
      <SelectMenu
        open={open}
        anchorRef={anchor}
        onClose={() => setOpen(false)}
        minWidth={180}
        role="listbox"
      >
        {options.map(option => (
          <SelectMenuItem
            key={option.value}
            label={option.label}
            selected={option.value === value}
            onSelect={() => {
              setOpen(false)
              onChange(option.value)
            }}
          />
        ))}
      </SelectMenu>
    </>
  )
}
