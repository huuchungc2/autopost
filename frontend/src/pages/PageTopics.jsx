import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { WEEK_DAYS as DAYS } from '../config/vi';
import Skeleton from '../components/ui/Skeleton';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';

export default function PageTopics() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [pageName, setPageName] = useState('');
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [topicForm, setTopicForm] = useState({ day_of_week: 1, topic: '', post_time: '08:00:00' });

  const loadTopics = async () => {
    const [pageRes, topicsRes] = await Promise.all([
      api.get(`/pages/${id}`),
      api.get(`/pages/${id}/topics`),
    ]);
    setPageName(pageRes.data.name || '');
    setTopics(topicsRes.data);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadTopics()
      .catch((err) => {
        if (!cancelled) {
          showToast(err.response?.data?.error || 'Không tải được chủ đề', 'error');
          navigate('/pages', { replace: true });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id, navigate, showToast]);

  const addTopic = async () => {
    if (!topicForm.topic.trim()) {
      showToast('Nhập chủ đề', 'error');
      return;
    }
    try {
      await api.post(`/pages/${id}/topics`, topicForm);
      showToast('Đã thêm chủ đề', 'success');
      await loadTopics();
      setTopicForm({ day_of_week: 1, topic: '', post_time: '08:00:00' });
    } catch (err) {
      showToast(err.response?.data?.error || 'Không thêm được chủ đề', 'error');
    }
  };

  if (loading) {
    return (
      <div className="page-shell post-editor-page">
        <Skeleton lines={6} />
      </div>
    );
  }

  return (
    <div className="page-shell post-editor-page">
      <PageHeader
        back={{
          onClick: () => navigate('/pages'),
          label: 'Quay lại',
          ariaLabel: 'Quay lại danh sách fanpage',
        }}
        title="Chủ đề tự động"
        description={pageName ? `Lịch nội dung cho ${pageName}` : 'Thêm chủ đề theo ngày trong tuần'}
      />

      <div className="card form-card">
        <div className="modal-section" style={{ marginTop: 0, paddingTop: 0, border: 'none' }}>
          <h4 className="modal-section-title">Thêm chủ đề</h4>
          <div className="modal-form-grid">
            <label>
              Ngày
              <select
                value={topicForm.day_of_week}
                onChange={(e) => setTopicForm({ ...topicForm, day_of_week: Number(e.target.value) })}
              >
                {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </label>
            <label>
              Giờ đăng
              <input
                type="time"
                value={topicForm.post_time}
                onChange={(e) => setTopicForm({ ...topicForm, post_time: e.target.value })}
              />
            </label>
            <label className="field-span-2">
              Chủ đề
              <input
                value={topicForm.topic}
                onChange={(e) => setTopicForm({ ...topicForm, topic: e.target.value })}
                placeholder="Nội dung / chủ đề bài viết"
              />
            </label>
          </div>
          <Button type="button" onClick={addTopic}>Thêm vào lịch</Button>
        </div>

        <div className="modal-section">
          <h4 className="modal-section-title">Danh sách ({topics.length})</h4>
          {topics.length === 0 ? (
            <p className="text-muted" style={{ margin: 0 }}>Chưa có chủ đề nào.</p>
          ) : (
            <div className="modal-table-wrap">
              <table className="table">
                <thead><tr><th>Ngày</th><th>Chủ đề</th><th>Giờ</th><th>Bật</th></tr></thead>
                <tbody>
                  {topics.map((t) => (
                    <tr key={t.id}>
                      <td>{DAYS.find((d) => d.value === t.day_of_week)?.label}</td>
                      <td>{t.topic}</td>
                      <td>{t.post_time}</td>
                      <td>{t.is_active ? 'Có' : 'Không'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
