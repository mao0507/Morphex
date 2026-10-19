import { createProgressTracker } from './run-job';

describe('createProgressTracker', () => {
  it('token 被切在兩個 chunk 之間也能解析', () => {
    const tracker = createProgressTracker(100);
    expect(tracker.feed('frame=1 time=00:00:')).toBeUndefined();
    expect(tracker.feed('50.00 bitrate=1k\r')).toBe(50);
  });

  it('同一個 chunk 有多個 time= 時取最後一個', () => {
    const tracker = createProgressTracker(100);
    expect(
      tracker.feed(
        'time=00:00:10.00 x\rtime=00:00:20.00 x\rtime=00:00:30.00 x\r',
      ),
    ).toBe(30);
  });

  it('以 CR 或 LF 分行，尚未結束的行留到下一個 chunk', () => {
    const tracker = createProgressTracker(100);
    expect(tracker.feed('time=00:00:10.00 x\ntime=00:00:2')).toBe(10);
    expect(tracker.feed('5.00 x\r')).toBe(25);
  });

  it('上限 99，100 只留給正常結束', () => {
    const tracker = createProgressTracker(10);
    expect(tracker.feed('time=00:00:12.00 x\r')).toBe(99);
  });

  it('沒有長度時不回報進度', () => {
    const tracker = createProgressTracker(undefined);
    expect(tracker.feed('time=00:00:12.00 x\r')).toBeUndefined();
  });
});
