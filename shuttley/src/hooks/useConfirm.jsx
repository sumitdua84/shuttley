import { useCallback, useRef, useState } from 'react'
import ConfirmModal from '../components/ConfirmModal'

// Promise-based replacement for window.confirm(), so call sites can do:
//   if (!(await confirmDialog('Delete this?'))) return
// Render `confirmModal` once in the page's JSX to show the dialog when active.
export function useConfirm() {
  const [message, setMessage] = useState(null)
  const resolver = useRef(null)

  const confirmDialog = useCallback((msg) => {
    setMessage(msg)
    return new Promise(resolve => { resolver.current = resolve })
  }, [])

  function handleConfirm() {
    resolver.current?.(true)
    setMessage(null)
  }
  function handleCancel() {
    resolver.current?.(false)
    setMessage(null)
  }

  const confirmModal = <ConfirmModal message={message} onConfirm={handleConfirm} onCancel={handleCancel} />

  return [confirmDialog, confirmModal]
}
