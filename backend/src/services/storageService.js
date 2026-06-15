import fs from 'fs';
import path from 'path';

export function getDirectorySize(directory) {
  const dirPath = path.resolve(directory);
  if (!fs.existsSync(dirPath)) {
    return 0;
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.reduce((total, entry) => {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      return total + getDirectorySize(entryPath);
    }
    return total + fs.statSync(entryPath).size;
  }, 0);
}

export function bytesToMB(bytes) {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

export function getStorageUsage(directory, maxMb) {
  const usedBytes = getDirectorySize(directory);
  const usedMb = bytesToMB(usedBytes);
  const percent = maxMb ? Math.round((usedMb / maxMb) * 100) : 0;
  return { usedMb, percent };
}
