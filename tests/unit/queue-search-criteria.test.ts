import { describe, expect, it } from 'vitest';
import {
  countCriteria, criteriaToQuery, emptySearchCriteria,
} from '../../src/components/portal/QueueSearchPanel';

/**
 * Điều kiện tìm kiếm là thứ duy nhất quyết định hồ sơ nào được tải về, nên cách nó biến thành query
 * string phải chặt: một trường bị rơi mất ở đây thì máy chủ lặng lẽ trả về nhiều hơn yêu cầu, và
 * không có gì trên màn hình báo cho người dùng biết điều đó.
 */
describe('Điều kiện tìm kiếm hồ sơ', () => {
  it('bỏ hết trường rỗng khỏi query, không gửi tham số trống', () => {
    expect(criteriaToQuery(emptySearchCriteria())).toEqual({});
    // Chuỗi chỉ có khoảng trắng cũng là rỗng — nếu không, người dùng gõ nhầm dấu cách vào ô từ khoá
    // sẽ nhận về danh sách rỗng mà không hiểu vì sao.
    expect(criteriaToQuery({ ...emptySearchCriteria(), search: '   ' })).toEqual({});
  });

  it('giữ đủ mọi trường có giá trị, kể cả các trường vừa gộp từ bộ lọc cũ', () => {
    const full = {
      ...emptySearchCriteria(),
      campaignId: 'c1', channelId: 'ch1', branchCode: '635', department: 'Phòng QLKH 1',
      clusterName: 'Cụm Tây Nguyên', workflowStatus: 'PENDING', slaStatus: 'OVERDUE',
      errorCode: 'TD01.01', errorGroup: 'TD01', officerName: 'Phạm Cán Bộ',
      riskLevel: 'CAO', businessLine: 'TIN_DUNG',
      unresolvedOnly: 'true', specialOnly: 'true', hasEvidence: 'YES',
      dateFrom: '2026-01-01', dateTo: '2026-12-31', search: 'cà phê',
    };
    const query = criteriaToQuery(full);

    // Đếm theo số khoá thay vì liệt kê lại: thêm một điều kiện mới mà quên nối dây thì bài này đổ.
    expect(Object.keys(query)).toHaveLength(Object.keys(full).length);
    expect(query.specialOnly).toBe('true');
    expect(query.hasEvidence).toBe('YES');
    expect(query.officerName).toBe('Phạm Cán Bộ');
  });

  it('đếm điều kiện đang áp dụng để huy hiệu trên nút Bộ lọc nói đúng', () => {
    expect(countCriteria(emptySearchCriteria())).toBe(0);
    expect(countCriteria({ ...emptySearchCriteria(), branchCode: '635' })).toBe(1);
    expect(countCriteria({ ...emptySearchCriteria(), branchCode: '635', specialOnly: 'true', dateFrom: '2026-01-01' })).toBe(3);
    // Trường rỗng và trường chỉ có khoảng trắng đều là "không lọc", không được đếm.
    expect(countCriteria({ ...emptySearchCriteria(), search: '  ', dateTo: '' })).toBe(0);
  });

  it('không đánh rơi trường nào giữa criteria rỗng và danh sách trường của form', () => {
    // `emptySearchCriteria` là nguồn sự thật cho hình dạng điều kiện; mọi khoá phải là chuỗi rỗng,
    // vì một `undefined` lọt vào sẽ thành chuỗi "undefined" khi qua URLSearchParams.
    const empty = emptySearchCriteria();
    for (const [key, value] of Object.entries(empty)) {
      expect(typeof value, key).toBe('string');
      expect(value, key).toBe('');
    }
  });
});
