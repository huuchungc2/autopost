import { useEffect, useState } from 'react';
import api from '../services/api';

let cached = null;
let pending = null;

async function fetchMediaStorage() {
  if (cached) return cached;
  if (!pending) {
    pending = api.get('/settings')
      .then((r) => {
        const onDrive = Boolean(r.data?.storage?.images_on_drive);
        cached = { imagesOnDrive: onDrive };
        return cached;
      })
      .catch(() => ({ imagesOnDrive: false }))
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export function invalidateMediaStorageCache() {
  cached = null;
}

/** Trạng thái lưu ảnh hệ thống (VPS local vs Google Drive). */
export function useMediaStorage() {
  const [imagesOnDrive, setImagesOnDrive] = useState(cached?.imagesOnDrive ?? false);
  const [loaded, setLoaded] = useState(Boolean(cached));

  useEffect(() => {
    let active = true;
    fetchMediaStorage().then((data) => {
      if (!active) return;
      setImagesOnDrive(data.imagesOnDrive);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  return { imagesOnDrive, loaded };
}

export function saveImagePersistLabel(imagesOnDrive) {
  if (imagesOnDrive) {
    return 'Lưu ảnh AI lên Google Drive (bỏ tick = dùng URL ảnh AI tạm, không lưu Drive)';
  }
  return 'Lưu ảnh AI lên VPS (bỏ tick = đăng thẳng URL ảnh AI lên Facebook)';
}
