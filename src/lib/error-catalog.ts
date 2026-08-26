import { ErrorMasterItem } from '../types';

/**
 * Danh mục mã sai sót tín dụng dùng chung với CoPlus (Tham số → Danh mục sai sót TD/PTD).
 * Đây là dữ liệu tham chiếu nghiệp vụ, không phải dữ liệu demo: mỗi mã gắn với một văn bản
 * quy định và được đối chiếu khi nhập biên bản.
 */
export const ERROR_CODE_CATALOG: ErrorMasterItem[] = [
  {
    code: 'TD01.01',
    group: 'TD01',
    groupName: 'Điều kiện ủy nhiệm của HSC/Cấp phê duyệt',
    title: 'Chưa tuân thủ đầy đủ điều kiện ủy nhiệm',
    description: 'Chưa tuân thủ đầy đủ điều kiện ủy nhiệm của HSC; hoặc của cấp phê duyệt tín dụng tại Chi nhánh',
    referenceDoc: 'Quyết định 121/QĐ-KTGS'
  },
  {
    code: 'TD02.01',
    group: 'TD02',
    groupName: 'Hồ sơ vay vốn',
    title: 'Thiếu hồ sơ pháp lý / hồ sơ khách hàng',
    description: 'Nêu rõ loại hồ sơ còn thiếu trong danh mục tài liệu bắt buộc theo quy định',
    referenceDoc: 'Quy trình tín dụng KHCN'
  },
  {
    code: 'TD02.04',
    group: 'TD02',
    groupName: 'Hồ sơ vay vốn',
    title: 'Hồ sơ tài chính không đầy đủ',
    description: 'Hồ sơ chứng minh nguồn thu nhập, báo cáo tài chính hoặc bảng kê thu nhập chưa được thẩm định đối chiếu hợp lệ',
    referenceDoc: 'Sổ tay tín dụng'
  },
  {
    code: 'TD02.05',
    group: 'TD02',
    groupName: 'Hồ sơ vay vốn',
    title: 'Tài liệu không phải bản chính hoặc sao y chứng thực',
    description: 'Các tài liệu, hồ sơ tín dụng không phải là bản chính hoặc là bản photocopy không có xác nhận công chứng/chứng thực hoặc dấu sao y bản chính',
    referenceDoc: 'Thông tư 39/2016/TT-NHNN'
  },
  {
    code: 'TD02.06',
    group: 'TD02',
    groupName: 'Hồ sơ vay vốn',
    title: 'Hồ sơ cấp tín dụng không bảo đảm tính pháp lý',
    description: 'Người đại diện Bên vay vốn ký kết HĐTD khi chưa đủ thẩm quyền đại diện; vượt phạm vi ủy quyền',
    referenceDoc: 'Bộ Luật Dân Sự'
  },
  {
    code: 'TD02.07',
    group: 'TD02',
    groupName: 'Hồ sơ vay vốn',
    title: 'Hồ sơ phương án/dự án vay vốn chưa đầy đủ',
    description: 'Phương án vay vốn thiếu dự toán chi tiết hoặc hóa đơn chứng từ chứng minh phương án khả thi',
    referenceDoc: 'Quy trình cấp TD từng lần'
  },
  {
    code: 'TD03.01',
    group: 'TD03',
    groupName: 'Thẩm định và phê duyệt',
    title: 'Báo cáo thẩm định chưa đánh giá đầy đủ rủi ro',
    description: 'Chưa đánh giá năng lực tài chính trả nợ thực tế hoặc chưa kiểm tra CIC của người có liên quan',
    referenceDoc: 'Quy chế Thẩm định Tín dụng'
  },
  {
    code: 'TD03.04',
    group: 'TD03',
    groupName: 'Thẩm định và phê duyệt',
    title: 'Áp dụng chính sách cấp tín dụng chưa đúng đối tượng',
    description: 'Áp dụng lãi suất ưu đãi, thời hạn vay hoặc ân hạn gốc không đúng gói sản phẩm phê duyệt',
    referenceDoc: 'Văn bản hướng dẫn SP tín dụng'
  },
  {
    code: 'TD04.01',
    group: 'TD04',
    groupName: 'Giải ngân và quản lý sau cấp tín dụng',
    title: 'Chứng từ giải ngân chưa đầy đủ hoặc không đúng mục đích',
    description: 'Giải ngân thiếu ủy nhiệm chi, hóa đơn tài chính hoặc chuyển khoản sai người thụ hưởng theo phương án',
    referenceDoc: 'Quy trình kiểm soát giải ngân'
  },
  {
    code: 'TD05.01',
    group: 'TD05',
    groupName: 'Kiểm tra sau cho vay (KTSCV)',
    title: 'Kiểm tra sau cho vay chậm tiến độ',
    description: 'Không thực hiện kiểm tra sử dụng vốn vay trong vòng 30 ngày kể từ ngày giải ngân theo quy định',
    referenceDoc: 'Quy định KTSCV'
  },
  {
    code: 'TD06.01',
    group: 'TD06',
    groupName: 'Tài sản bảo đảm (TSBĐ)',
    title: 'Thực hiện định giá TSBĐ chưa đúng quy định',
    description: 'Chứng thư định giá hết hạn hoặc cán bộ không khảo sát thực tế hiện trạng tài sản',
    referenceDoc: 'Quy chuẩn Định giá TSBĐ'
  }
];
