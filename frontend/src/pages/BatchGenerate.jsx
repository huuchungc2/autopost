import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import useJobPolling from '../hooks/useJobPolling';
import { useToast } from '../context/ToastContext';
import { jobStatusLabel } from '../config/vi';
import {
  INTERVAL_OPTIONS,
  getDefaultStartSlot,
  normalizeTimeForApi,
} from '../utils/batchSchedule';

const emptyBulkJob = () => ({ topic: '' });

const emptyDailyJob = () => {
  const { scheduled_time } = getDefaultStartSlot();
  return { topic: '', scheduled_time, repeat_daily: true };
};

export default function BatchGenerate() {
  const [mode, setMode] = useState('bulk');
  const [pages, setPages] = useState([]);
  const [pageId, setPageId] = useState('');
  const [bulkJobs, setBulkJobs] = useState([emptyBulkJob()]);
  const [dailyJobs, setDailyJobs] = useState([emptyDailyJob()]);
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [batchId, setBatchId] = useState('');
  const [status, setStatus] = useState(null);
  const [polling, setPolling] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();

  const jobs = mode === 'bulk' ? bulkJobs : dailyJobs;

  useEffect(() => {
    api.get('/pages').then((response) => {
      setPages(response.data);
      if (response.data.length) setPageId(String(response.data[0].id));
    }).catch(console.error);
  }, []);

  useJobPolling(batchId, (data) => setStatus(data), polling && !!batchId);

  const setJobs = (updater) => {
    if (mode === 'bulk') {
      setBulkJobs(typeof updater === 'function' ? updater : () => updater);
    } else {
      setDailyJobs(typeof updater === 'function' ? updater : () => updater);
    }
  };

  const handleJobChange = (index, field, value) => {
    setJobs((current) => current.map((job, idx) => (idx === index ? { ...job, [field]: value } : job)));
  };

  const addJob = () => {
    if (mode === 'bulk') {
      setBulkJobs((c) => [...c, emptyBulkJob()]);
      return;
    }
    setDailyJobs((current) => {
      const last = current[current.length - 1];
      const nextTime = last?.scheduled_time
        ? addMinutesToTime(last.scheduled_time, intervalMinutes)
        : getDefaultStartSlot().scheduled_time;
      return [...current, { topic: '', scheduled_time: nextTime, repeat_daily: true }];
    });
  };

  const addMinutesToTime = (timeStr, minutes) => {
    const [hh, mm] = timeStr.slice(0, 5).split(':').map(Number);
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    d.setMinutes(d.getMinutes() + minutes);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const addMultipleJobs = (count) => {
    if (mode === 'bulk') {
      setBulkJobs((c) => [...c, ...Array.from({ length: count }, () => emptyBulkJob())]);
      return;
    }
    setDailyJobs((current) => {
      let next = [...current];
      for (let i = 0; i < count; i += 1) {
        const last = next[next.length - 1];
        const nextTime = last?.scheduled_time
          ? addMinutesToTime(last.scheduled_time, intervalMinutes)
          : getDefaultStartSlot().scheduled_time;
        next = [...next, { topic: '', scheduled_time: nextTime, repeat_daily: true }];
      }
      return next;
    });
  };

  const removeJob = (index) => {
    setJobs((current) => (current.length <= 1 ? current : current.filter((_, idx) => idx !== index)));
  };

  const applyIntervalToDaily = () => {
    setDailyJobs((current) => {
      if (!current.length) return current;
      const anchor = current[0].scheduled_time || '08:00';
      const [ah, am] = anchor.slice(0, 5).split(':').map(Number);
      return current.map((job, index) => {
        const d = new Date();
        d.setHours(ah, am, 0, 0);
        d.setMinutes(d.getMinutes() + intervalMinutes * index);
        return {
          ...job,
          scheduled_time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
          repeat_daily: true,
        };
      });
    });
    showToast('Đã sắp xếp lại khung giờ trong ngày', 'success');
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const validJobs = jobs
        .filter((job) => job.topic?.trim())
        .map((job) => {
          if (mode === 'bulk') {
            return { topic: job.topic.trim(), repeat_daily: false };
          }
          return {
            topic: job.topic.trim(),
            scheduled_time: normalizeTimeForApi(job.scheduled_time),
            repeat_daily: true,
          };
        });

      if (!validJobs.length) {
        showToast('Nhập ít nhất một chủ đề', 'error');
        return;
      }

      const response = await api.post('/posts/generate-batch', { page_id: Number(pageId), jobs: validJobs });
      const { one_time_count: oneTime = 0, recurring_count: recurring = 0 } = response.data;

      if (mode === 'bulk' && oneTime > 0) {
        setBatchId(response.data.batch_id);
        setPolling(true);
        showToast(`Đã tạo lô ${oneTime} chủ đề — bấm Chạy AI, rồi vào Bài viết để lên lịch/đăng`, 'success');
      } else if (recurring > 0) {
        showToast(`Đã lưu ${recurring} khung giờ hằng ngày — đến giờ hệ thống tự AI + đăng FB`, 'success');
      }
    } catch (error) {
      showToast(error.response?.data?.error || 'Lưu thất bại', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const processBatch = async () => {
    if (!batchId) return;
    setIsLoading(true);
    try {
      await api.post(`/jobs/${batchId}/process`);
      showToast('AI đang tạo bài — vào Bài viết để xem và lên lịch', 'success');
      setPolling(true);
    } catch (error) {
      showToast(error.response?.data?.error || 'Chạy AI thất bại', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const progress = status?.summary
    ? Math.round(((status.summary.done + status.summary.failed) / status.summary.total) * 100)
    : 0;

  const intervalLabel = INTERVAL_OPTIONS.find((o) => o.value === intervalMinutes)?.label || `${intervalMinutes} phút`;

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Tạo bài hàng loạt</h1>
          <p>Hai cách dùng — chọn tab phù hợp.</p>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button type="button" className={mode === 'bulk' ? 'tab active' : 'tab'} onClick={() => setMode('bulk')}>
          Tạo hàng loạt → tự lên lịch
        </button>
        <button type="button" className={mode === 'daily' ? 'tab active' : 'tab'} onClick={() => setMode('daily')}>
          Lịch hằng ngày (tạo + đăng)
        </button>
      </div>

      {mode === 'bulk' ? (
        <div className="card batch-help-card">
          <h3>Cách 1: AI tạo nhiều bài, bạn tự quyết đăng</h3>
          <ol className="batch-help-steps">
            <li>Nhập danh sách <strong>chủ đề</strong> (không cần chọn giờ).</li>
            <li><strong>Lưu</strong> → <strong>Chạy AI</strong> — tất cả bài vào <strong>Chờ duyệt</strong>.</li>
            <li>Vào <Link to="/posts">Bài viết</Link> → xem/sửa → <strong>lên lịch</strong> hoặc <strong>đăng</strong> theo ý.</li>
          </ol>
        </div>
      ) : (
        <div className="card batch-help-card">
          <h3>Cách 2: Mỗi ngày đúng giờ — AI tạo và đăng luôn</h3>
          <ol className="batch-help-steps">
            <li>Nhập <strong>chủ đề</strong> + <strong>giờ</strong> (VD: 08:00, 11:00).</li>
            <li><strong>Lưu lịch</strong> — không cần Chạy AI.</li>
            <li>Mỗi ngày đến đúng giờ → hệ thống <strong>tự AI + đăng Facebook</strong>.</li>
          </ol>
        </div>
      )}

      <div className="card form-card">
        <div className="batch-settings-row">
          <label>
            Fanpage
            <select value={pageId} onChange={(e) => setPageId(e.target.value)}>
              {pages.map((page) => (
                <option key={page.id} value={page.id}>{page.name}</option>
              ))}
            </select>
          </label>

          {mode === 'daily' && (
            <>
              <label>
                Khoảng cách giữa các khung giờ
                <select value={intervalMinutes} onChange={(e) => setIntervalMinutes(Number(e.target.value))}>
                  {INTERVAL_OPTIONS.filter((o) => o.value < 1440).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <div className="batch-settings-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={applyIntervalToDaily}>
                  Sắp xếp lại giờ
                </button>
              </div>
            </>
          )}
        </div>

        {mode === 'daily' && dailyJobs[0]?.scheduled_time && (
          <p className="field-hint batch-schedule-hint">
            Khung đầu: <strong>{dailyJobs[0].scheduled_time?.slice(0, 5)}</strong>
            {dailyJobs.length > 1 && <> — các khung cách nhau <strong>{intervalLabel}</strong></>}
          </p>
        )}

        <div className={`batch-job-header${mode === 'bulk' ? ' batch-job-header--bulk' : ''}`}>
          <span>#</span>
          <span>Chủ đề cho AI</span>
          {mode === 'daily' && <span>Giờ (mỗi ngày)</span>}
          <span />
        </div>

        {jobs.map((job, index) => (
          <div key={index} className={`batch-job-row${mode === 'bulk' ? ' batch-job-row--bulk' : ''}`}>
            <span className="batch-job-index">{index + 1}</span>
            <input
              value={job.topic}
              onChange={(e) => handleJobChange(index, 'topic', e.target.value)}
              placeholder={mode === 'daily' ? `VD: Tin sáng — slot ${index + 1}` : `VD: Chủ đề bài ${index + 1}`}
            />
            {mode === 'daily' && (
              <input
                type="time"
                value={job.scheduled_time?.slice(0, 5) || ''}
                onChange={(e) => handleJobChange(index, 'scheduled_time', e.target.value)}
              />
            )}
            <button type="button" className="btn-link" onClick={() => removeJob(index)} disabled={jobs.length <= 1}>
              Xóa
            </button>
          </div>
        ))}

        <div className="header-actions batch-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={addJob}>+ Thêm chủ đề</button>
          <button type="button" className="btn btn-secondary" onClick={() => addMultipleJobs(5)}>+ Thêm 5</button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={isLoading || !pageId}>
            {mode === 'bulk' ? 'Lưu & chuẩn bị' : 'Lưu lịch hằng ngày'}
          </button>
          {mode === 'bulk' && batchId && (
            <button type="button" className="btn btn-secondary" onClick={processBatch} disabled={isLoading}>
              Chạy AI
            </button>
          )}
        </div>

        {mode === 'bulk' && batchId && (
          <div style={{ marginTop: 16 }}>
            <div className="form-success">Mã lô: {batchId}</div>
            {status && (
              <div className="progress-bar-wrap">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
                <span>{progress}% — {status.summary.done} xong, {status.summary.failed} lỗi</span>
              </div>
            )}
          </div>
        )}
      </div>

      {mode === 'bulk' && status && (
        <div className="card" style={{ marginTop: 24 }}>
          <h2>Tiến độ AI</h2>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>#</th><th>Chủ đề</th><th>Trạng thái</th><th>Bài viết</th><th>Lỗi</th></tr>
              </thead>
              <tbody>
                {status.jobs.map((job, index) => (
                  <tr key={job.id}>
                    <td>{index + 1}</td>
                    <td>{job.topic}</td>
                    <td>{jobStatusLabel(job.status)}</td>
                    <td>{job.post_id ? <Link to="/posts">#{job.post_id}</Link> : '—'}</td>
                    <td>{job.error_message || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
