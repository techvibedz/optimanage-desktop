import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

interface BarcodeProps {
  value: string
  width?: number       // bar width in px
  height?: number      // bar height in px
  fontSize?: number    // text below barcode (0 hides it)
  displayValue?: boolean
  margin?: number
  format?: string
  className?: string
  style?: React.CSSProperties
}

/**
 * Renders a barcode as inline SVG using JsBarcode.
 * Used in OrderSlip to encode the orderNumber for fast scan-to-open.
 */
export default function Barcode({
  value,
  width = 1.4,
  height = 32,
  fontSize = 10,
  displayValue = true,
  margin = 0,
  format = 'CODE128',
  className,
  style,
}: BarcodeProps) {
  const ref = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    if (!ref.current || !value) return
    try {
      JsBarcode(ref.current, value, {
        format,
        width,
        height,
        displayValue,
        fontSize,
        margin,
        background: '#ffffff',
        lineColor: '#000000',
      })
    } catch {
      /* noop — invalid value */
    }
  }, [value, width, height, fontSize, displayValue, margin, format])

  if (!value) return null
  return <svg ref={ref} className={className} style={style} />
}
