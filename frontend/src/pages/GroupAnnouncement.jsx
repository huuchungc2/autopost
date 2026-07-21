import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import { useToast } from '../context/ToastContext';

// Thông báo GroupFlow (website → extension) — admin/super_admin đặt, extension hiện toast khi mở panel.
export default function GroupAnnouncement() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [ann, setAnn] = useState({ enabled: false, level: 'info', message: '', latest_version: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.get('/settings');
        const a = res.data?.config?.groupflow_announcement;
        if (a) setAnn({ enabled: !!a.enabled, level: a.level || 'info', message: a.message || '', latest_version: a.latest_version || '' });
      } catch (err) {
        showToast(err.response?.data?.error || 'Không tải được thông báo', 'error');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put('/settings/groupflow-announcement', ann);
      const a = res.data?.groupflow_announcement;
      if (a) setAnn({ enabled: !!a.enabled, level: a.level || 'info', message: a.message || '', latest_version: a.latest_version || '' });
      showToast('Đã lưu thông báo GroupFlow', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Lưu thất bại', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-shell">
      <PageHeader
        back={{ onClick: () => navigate('/groups'), label: 'Group' }}
        title="Thông báo extension"
        description="Đẩy thông báo xuống mọi extension GroupFlow (hiện toast khi mở panel) — báo bản mới, sự cố, nhắc nhở…"
      />

      <div className="card" style={{ maxWidth: 640 }}>
        {loading ? (
          <p className="text-muted">Đang tải…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={ann.enabled}
                onChange={(e) => setAnn((a) => ({ ...a, enabled: e.target.checked }))}
              />
              Bật thông báo (extension hiện toast khi mở panel)
            </label>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="field-hint">Mức độ</span>
                <select
                  className="input"
                  style={{ maxWidth: 180 }}
                  value={ann.level}
                  onChange={(e) => setAnn((a) => ({ ...a, level: e.target.value }))}
                >
                  <option value="info">Thông tin</option>
                  <option value="warning">Cảnh báo</option>
                  <option value="critical">Khẩn cấp</option>
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 180 }}>
                <span className="field-hint">Bản mới nhất (cảnh báo cập nhật)</span>
                <input
                  type="text"
                  className="input"
                  placeholder="VD: 1.0.281"
                  value={ann.latest_version}
                  onChange={(e) => setAnn((a) => ({ ...a, latest_version: e.target.value }))}
                />
              </label>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="field-hint">Nội dung thông báo</span>
              <textarea
                className="input"
                rows={3}
                maxLength={500}
                placeholder="VD: Đã có bản mới, vui lòng tải lại extension…"
                value={ann.message}
                onChange={(e) => setAnn((a) => ({ ...a, message: e.target.value }))}
              />
            </label>

            <div>
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? 'Đang lưu…' : 'Lưu thông báo'}
              </Button>
            </div>

            <p className="field-hint">
              Extension đọc khi mở panel (độ trễ vài phút). Chỉ hiện toast 1 lần cho mỗi lần bạn lưu. Ô "Bản mới nhất" so với version extension đang chạy — cũ hơn thì extension nhắc tải lại. Bỏ tick "Bật" để tắt.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
