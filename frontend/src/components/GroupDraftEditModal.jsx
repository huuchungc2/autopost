import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';

export default function GroupDraftEditModal({ draft, open, onClose, onSaved }) {
  const [form, setForm] = useState({ noi_dung: '', prompt_anh: '', ngay_dang: '', gio_dang: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!draft) return;
    setForm({
      noi_dung: draft.noi_dung || '',
      prompt_anh: draft.prompt_anh || '',
      ngay_dang: draft.ngay_dang || '',
      gio_dang: draft.gio_dang || '',
    });
  }, [draft]);

  const handleSave = async () => {
    if (!draft?.id) return;
    setSaving(true);
    try {
      await onSaved(draft.id, {
        noi_dung: form.noi_dung,
        prompt_anh: form.prompt_anh || null,
        ngay_dang: form.ngay_dang || null,
        gio_dang: form.gio_dang || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sửa draft"
      subtitle={draft?.is_shared ? 'Draft chia sẻ team' : 'Draft cá nhân'}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button onClick={handleSave} disabled={saving || !form.noi_dung.trim()}>
            {saving ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </>
      )}
    >
      <label>
        Nội dung
        <textarea
          className="input"
          rows={6}
          value={form.noi_dung}
          onChange={(e) => setForm((f) => ({ ...f, noi_dung: e.target.value }))}
        />
      </label>
      <label style={{ display: 'block', marginTop: 12 }}>
        Prompt ảnh
        <textarea
          className="input"
          rows={2}
          value={form.prompt_anh}
          onChange={(e) => setForm((f) => ({ ...f, prompt_anh: e.target.value }))}
        />
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <label style={{ flex: 1 }}>
          Ngày đăng
          <input
            type="date"
            className="input"
            value={form.ngay_dang || ''}
            onChange={(e) => setForm((f) => ({ ...f, ngay_dang: e.target.value }))}
          />
        </label>
        <label style={{ flex: 1 }}>
          Giờ đăng
          <input
            type="time"
            className="input"
            value={form.gio_dang || ''}
            onChange={(e) => setForm((f) => ({ ...f, gio_dang: e.target.value }))}
          />
        </label>
      </div>
    </Modal>
  );
}
