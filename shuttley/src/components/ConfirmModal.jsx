export default function ConfirmModal({ message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = true, onConfirm, onCancel }) {
  if (!message) return null
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-box" onClick={e => e.stopPropagation()}>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={onCancel}>{cancelLabel}</button>
          <button className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`} style={{ flex: 1 }} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
