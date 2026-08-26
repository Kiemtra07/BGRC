import { CustomerRecord, ErrorMasterItem, EmailScheduleConfig, UserProfile } from '../types';

export const INITIAL_ERROR_MASTER: ErrorMasterItem[] = [
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

export const MOCK_USERS: UserProfile[] = [
  {
    id: 'USR_ADMIN',
    name: 'Trần Văn Trưởng',
    email: 'admin.audit@bank.vn',
    portal: 'INTERNAL',
    role: 'ADMIN',
    department: 'Ban Kiểm Tra & Giám Sát Nội Bộ'
  },
  {
    id: 'USR_SUP',
    name: 'Nguyễn Thị Giám Sát',
    email: 'giamsat.audit@bank.vn',
    portal: 'INTERNAL',
    role: 'SUPERVISOR',
    department: 'Phòng Giám Sát Hoạt Động Tín Dụng'
  },
  {
    id: 'USR_APPROVER_INT',
    name: 'Lê Văn Duyệt',
    email: 'pheduyet.audit@bank.vn',
    portal: 'INTERNAL',
    role: 'INTERNAL_APPROVER',
    department: 'Hội Đồng Phê Duyệt & Xử Lý Sai Sót'
  },
  {
    id: 'USR_OFFICER',
    name: 'Phạm Văn Kiểm Tra',
    email: 'canbo.kiemtra@bank.vn',
    portal: 'INTERNAL',
    role: 'INTERNAL_OFFICER',
    department: 'Đoàn Kiểm Tra Số 19'
  },
  {
    id: 'USR_BRANCH_INPUT',
    name: 'Hoàng Văn Nhập',
    email: 'nhaplieu.buonho@bank.vn',
    portal: 'BRANCH',
    role: 'BRANCH_INPUT',
    clusterName: 'Cụm Tây Nguyên',
    branchName: 'Chi nhánh Nam Buôn Hồ',
    branchCode: '635',
    department: 'PGD Nam Buôn Hồ 1'
  },
  {
    id: 'USR_CLUSTER_APP',
    name: 'Đặng Thị Cụm Trưởng',
    email: 'cumtruong.taynguyen@bank.vn',
    portal: 'BRANCH',
    role: 'BRANCH_CONTROLLER',
    clusterName: 'Cụm Tây Nguyên',
    branchName: 'Chi nhánh Nam Buôn Hồ',
    branchCode: '635',
    department: 'Ban Giám Đốc Cụm Chi Nhánh'
  }
];

export const INITIAL_CUSTOMERS: CustomerRecord[] = [
  {
    id: 'CUST_001',
    cif: '108823419',
    customerName: 'Nguyễn Hoàng Long',
    clusterName: 'Cụm Tây Nguyên',
    branchCode: '635',
    branchName: 'Chi nhánh Nam Buôn Hồ',
    department: 'PGD Nam Buôn Hồ 1',
    decisionNo: '121/QĐ-KTGS2025 ngày 20/01/2025',
    auditDate: '30/09/2025',
    inspectorName: 'Phạm Văn Kiểm Tra',
    creditBalance: 1450,
    loanGroup: 'Nhóm 1',
    collateralValue: 2800,
    loanPurpose: 'Vay bổ sung vốn kinh doanh nông sản cà phê',
    officerName: 'Vũ Minh Tuấn',
    deptHeadName: 'Trần Đình Trọng',
    totalErrors: 2,
    activeErrors: 1,
    resolvedErrors: 1,
    errors: [
      {
        id: 'ERR_001_1',
        customerId: 'CUST_001',
        errorCode: 'TD01.01',
        errorGroup: 'TD01',
        errorTitle: 'Chưa tuân thủ đầy đủ điều kiện ủy nhiệm của HSC',
        description: 'Chưa thu thập đầy đủ phụ lục hợp đồng ủy nhiệm trước khi ký hợp đồng giải ngân.',
        quantity: 1,
        exposureAmount: 1450,
        status: 'SUBMITTED_INTERNAL',
        deadlineDate: '2026-09-15',
        isOverdue: false,
        resolutionNotes: 'Đã bổ sung đầy đủ văn bản ủy quyền số 45/VB-UQ và phụ lục đính kèm theo biên bản kiểm tra.',
        attachments: [
          {
            id: 'ATT_001',
            fileName: 'VanBanUyQuyen_NguyenHoangLong_Signed.pdf',
            fileType: 'pdf',
            fileSize: '2.4 MB',
            driveFileId: '1AbC_98df8942jkla9d8f92',
            driveUrl: 'https://drive.google.com/file/d/1AbC_98df8942jkla9d8f92/view',
            uploadDate: '2026-08-22 14:30',
            uploadedBy: 'Hoàng Văn Nhập (PGD Nam Buôn Hồ 1)',
            uploaderRole: 'BRANCH_INPUT',
            errorId: 'ERR_001_1',
            customerId: 'CUST_001',
            notes: 'Bản scan có dấu mộc công chứng và chữ ký người ủy quyền'
          }
        ],
        history: [
          {
            id: 'LOG_1',
            timestamp: '2026-08-20 09:00',
            action: 'CREATE',
            actorName: 'Phạm Văn Kiểm Tra',
            actorRole: 'INTERNAL_OFFICER',
            notes: 'Khởi tạo sai sót từ Biên bản kiểm tra Đợt 1/2025'
          },
          {
            id: 'LOG_2',
            timestamp: '2026-08-22 14:32',
            action: 'ATTACH_FILE',
            actorName: 'Hoàng Văn Nhập',
            actorRole: 'BRANCH_INPUT',
            notes: 'Tải lên hồ sơ khắc phục VanBanUyQuyen_NguyenHoangLong_Signed.pdf'
          },
          {
            id: 'LOG_3',
            timestamp: '2026-08-23 10:15',
            action: 'BRANCH_CONTROL_APPROVE',
            actorName: 'Đặng Thị Cụm Trưởng',
            actorRole: 'BRANCH_CONTROLLER',
            notes: 'Cụm Tây Nguyên đã kiểm tra hồ sơ hợp lệ và chuyển tiếp lên Khối Nội Bộ'
          }
        ]
      },
      {
        id: 'ERR_001_2',
        customerId: 'CUST_001',
        errorCode: 'TD02.05',
        errorGroup: 'TD02',
        errorTitle: 'Hồ sơ tín dụng photocopy thiếu công chứng',
        description: 'Bản sao CCCD và Giấy chứng nhận ĐKKD của khách hàng chưa được công chứng.',
        quantity: 1,
        exposureAmount: 500,
        status: 'WAIVED_RESOLVED',
        deadlineDate: '2026-08-10',
        isOverdue: false,
        resolutionNotes: 'Đã đối chiếu bản gốc trực tiếp và lưu bản scan CCCD gắn chip có xác thực VNID.',
        attachments: [
          {
            id: 'ATT_002',
            fileName: 'CCCD_XacThuc_DinhKem.pdf',
            fileType: 'pdf',
            fileSize: '1.1 MB',
            driveFileId: '1XyZ_88921jkdhsf91283',
            driveUrl: 'https://drive.google.com/file/d/1XyZ_88921jkdhsf91283/view',
            uploadDate: '2026-08-11 08:20',
            uploadedBy: 'Hoàng Văn Nhập (PGD Nam Buôn Hồ 1)',
            uploaderRole: 'BRANCH_INPUT',
            errorId: 'ERR_001_2',
            customerId: 'CUST_001'
          }
        ],
        history: [
          {
            id: 'LOG_4',
            timestamp: '2026-08-12 16:00',
            action: 'INTERNAL_WAIVE',
            actorName: 'Lê Văn Duyệt',
            actorRole: 'INTERNAL_APPROVER',
            notes: 'Khối nội bộ đã kiểm tra đối chiếu bản gốc CCCD gắn chip -> Phê duyệt bỏ lỗi thành công'
          }
        ]
      }
    ]
  },
  {
    id: 'CUST_002',
    cif: '109384721',
    customerName: 'Công ty TNHH Nông Sản Cao Nguyên Xanh',
    clusterName: 'Cụm Tây Nguyên',
    branchCode: '635',
    branchName: 'Chi nhánh Nam Buôn Hồ',
    department: 'Phòng QLKH',
    decisionNo: '121/QĐ-KTGS2025 ngày 20/01/2025',
    auditDate: '30/09/2025',
    inspectorName: 'Phạm Văn Kiểm Tra',
    creditBalance: 5200,
    loanGroup: 'Nhóm 1',
    collateralValue: 9500,
    loanPurpose: 'Vay đầu tư dây chuyền sấy tiêu và chế biến cà phê xuất khẩu',
    officerName: 'Lê Thị Mỹ Hạnh',
    deptHeadName: 'Trần Đình Trọng',
    totalErrors: 2,
    activeErrors: 2,
    resolvedErrors: 0,
    errors: [
      {
        id: 'ERR_002_1',
        customerId: 'CUST_002',
        errorCode: 'TD05.01',
        errorGroup: 'TD05',
        errorTitle: 'Kiểm tra sau cho vay chậm tiến độ',
        description: 'Biên bản kiểm tra thực tế sử dụng vốn đợt giải ngân số 3 (1.2 tỷ) trễ 18 ngày so với hạn định.',
        quantity: 1,
        exposureAmount: 1200,
        status: 'PENDING',
        deadlineDate: '2026-08-20',
        isOverdue: true,
        attachments: [],
        history: [
          {
            id: 'LOG_5',
            timestamp: '2026-08-20 09:00',
            action: 'CREATE',
            actorName: 'Phạm Văn Kiểm Tra',
            actorRole: 'INTERNAL_OFFICER',
            notes: 'Phát hiện sai sót qua rà soát hệ thống tín dụng'
          }
        ]
      },
      {
        id: 'ERR_002_2',
        customerId: 'CUST_002',
        errorCode: 'TD06.01',
        errorGroup: 'TD06',
        errorTitle: 'Thực hiện định giá TSBĐ chưa đúng quy định',
        description: 'Chứng thư định giá quyền sử dụng đất kho bãi hết hạn 45 ngày chưa thực hiện định giá lại theo chu kỳ 12 tháng.',
        quantity: 1,
        exposureAmount: 4000,
        status: 'SUBMITTED_BRANCH',
        deadlineDate: '2026-09-01',
        isOverdue: false,
        resolutionNotes: 'Chi nhánh đã liên hệ Công ty Thẩm định giá Bất Động Sản VinaVal, đã có chứng thư định giá mới số 892/CT-VAL.',
        attachments: [
          {
            id: 'ATT_003',
            fileName: 'ChungThuDinhGia_KhoBai_VinaVal_2026.pdf',
            fileType: 'pdf',
            fileSize: '4.8 MB',
            driveFileId: '1Zza_87632kjsdf098123',
            driveUrl: 'https://drive.google.com/file/d/1Zza_87632kjsdf098123/view',
            uploadDate: '2026-08-23 16:45',
            uploadedBy: 'Hoàng Văn Nhập (PGD Nam Buôn Hồ 1)',
            uploaderRole: 'BRANCH_INPUT',
            errorId: 'ERR_002_2',
            customerId: 'CUST_002'
          }
        ],
        history: [
          {
            id: 'LOG_6',
            timestamp: '2026-08-23 16:48',
            action: 'SUBMIT_BRANCH_CONTROL',
            actorName: 'Hoàng Văn Nhập',
            actorRole: 'BRANCH_INPUT',
            notes: 'Đã đính kèm chứng thư định giá mới và đẩy lên duyệt Cụm'
          }
        ]
      }
    ]
  },
  {
    id: 'CUST_003',
    cif: '102948172',
    customerName: 'Trịnh Hoài Nam',
    clusterName: 'Cụm TP.HCM',
    branchCode: '428',
    branchName: 'Chi nhánh Bình Tây Sài Gòn',
    department: 'PGD Chợ Lớn',
    decisionNo: '88/QĐ-KTGS2025 ngày 15/01/2025',
    auditDate: '30/09/2025',
    inspectorName: 'Nguyễn Thị Giám Sát',
    creditBalance: 3200,
    loanGroup: 'Nhóm 2',
    collateralValue: 6000,
    loanPurpose: 'Vay mua nhà ở đô thị',
    officerName: 'Đỗ Quốc Bảo',
    deptHeadName: 'Lâm Văn Phước',
    totalErrors: 1,
    activeErrors: 0,
    resolvedErrors: 1,
    errors: [
      {
        id: 'ERR_003_1',
        customerId: 'CUST_003',
        errorCode: 'TD04.01',
        errorGroup: 'TD04',
        errorTitle: 'Chứng từ giải ngân chưa đầy đủ',
        description: 'Thiếu giấy nhận nợ có chữ ký của đồng sở hữu bên vay.',
        quantity: 1,
        exposureAmount: 3200,
        status: 'WAIVED_RESOLVED',
        deadlineDate: '2026-08-15',
        isOverdue: false,
        resolutionNotes: 'Đã bổ sung giấy nhận nợ có đầy đủ chữ ký 2 vợ chồng khách hàng.',
        attachments: [
          {
            id: 'ATT_004',
            fileName: 'GiayNhanNo_DongKy_TrinhHoaiNam.pdf',
            fileType: 'pdf',
            fileSize: '1.8 MB',
            driveFileId: '1Klm_876123kjsda90',
            driveUrl: 'https://drive.google.com/file/d/1Klm_876123kjsda90/view',
            uploadDate: '2026-08-14 11:20',
            uploadedBy: 'Đỗ Quốc Bảo (PGD Chợ Lớn)',
            uploaderRole: 'BRANCH_INPUT',
            errorId: 'ERR_003_1',
            customerId: 'CUST_003'
          }
        ],
        history: [
          {
            id: 'LOG_7',
            timestamp: '2026-08-15 14:00',
            action: 'INTERNAL_WAIVE',
            actorName: 'Lê Văn Duyệt',
            actorRole: 'INTERNAL_APPROVER',
            notes: 'Hồ sơ đầy đủ tính pháp lý -> Phê duyệt bỏ lỗi'
          }
        ]
      }
    ]
  },
  {
    id: 'CUST_004',
    cif: '104729103',
    customerName: 'Hộ kinh doanh Phan Thanh Bình',
    clusterName: 'Cụm Tây Nguyên',
    branchCode: '630',
    branchName: 'Chi nhánh Đắk Lắk',
    department: 'PGD Cư Mgar',
    decisionNo: '121/QĐ-KTGS2025 ngày 20/01/2025',
    auditDate: '30/09/2025',
    inspectorName: 'Phạm Văn Kiểm Tra',
    creditBalance: 850,
    loanGroup: 'Nhóm 1',
    collateralValue: 1800,
    loanPurpose: 'Vay chăm sóc vườn sầu riêng',
    officerName: 'Nguyễn Văn Hải',
    deptHeadName: 'Trịnh Quốc Doanh',
    totalErrors: 1,
    activeErrors: 1,
    resolvedErrors: 0,
    errors: [
      {
        id: 'ERR_004_1',
        customerId: 'CUST_004',
        errorCode: 'TD02.04',
        errorGroup: 'TD02',
        errorTitle: 'Hồ sơ tài chính không đầy đủ',
        description: 'Chưa có bảng kê chi phí vật tư phân bón và sản lượng thu hoạch vụ trước.',
        quantity: 1,
        exposureAmount: 850,
        status: 'PENDING',
        deadlineDate: '2026-08-28',
        isOverdue: false,
        attachments: [],
        history: [
          {
            id: 'LOG_8',
            timestamp: '2026-08-20 09:00',
            action: 'CREATE',
            actorName: 'Phạm Văn Kiểm Tra',
            actorRole: 'INTERNAL_OFFICER',
            notes: 'Ghi nhận lỗi từ tiểu biên bản kiểm tra'
          }
        ]
      }
    ]
  }
];

export const INITIAL_EMAIL_CONFIG: EmailScheduleConfig = {
  enabled: true,
  frequency: 'DAILY',
  triggerTime: '08:30',
  daysBeforeDeadline: 3,
  recipientClusters: ['Cụm Tây Nguyên', 'Cụm TP.HCM', 'Cụm Miền Trung - Tây Nguyên'],
  emailSubjectTemplate: '[AuditBGS CẢNH BÁO DEADLINE] Đôn đốc xử lý hồ sơ sai sót kiểm tra - {TenCum}',
  emailBodyTemplate: `Kính gửi Ban Giám Đốc và các Chi nhánh thuộc {TenCum},

Hệ thống Kiểm tra Giám sát AuditBGS thông báo:
Tính đến ngày {NgayHienTai}, Cụm của Quý đơn vị đang có {SoLoiTonDong} lỗi sai sót chưa hoàn tất xử lý (trong đó có {SoLoiQuaHan} lỗi đã quá hạn xử lý).

Danh sách các chi nhánh trọng điểm cần đôn đốc:
- {ChiNhanhTrongDiem}

Vui lòng chỉ đạo cán bộ nhập liệu cập nhật hồ sơ khắc phục và đẩy duyệt trước {HanChot}.
Truy cập Cổng Cụm Chi Nhánh để xử lý ngay: {LinkPortal}

Trân trọng,
Hệ Thống Quản Lý Sai Sót AuditBGS`,
  lastSentDate: '2026-08-24 08:30',
  logs: [
    {
      id: 'EML_001',
      sentAt: '2026-08-24 08:30',
      clusterName: 'Cụm Tây Nguyên',
      recipientEmail: 'cum.taynguyen.audit@bank.vn',
      subject: '[AuditBGS CẢNH BÁO DEADLINE] Đôn đốc xử lý hồ sơ sai sót kiểm tra - Cụm Tây Nguyên',
      errorCount: 3,
      status: 'SUCCESS'
    },
    {
      id: 'EML_002',
      sentAt: '2026-08-24 08:30',
      clusterName: 'Cụm TP.HCM',
      recipientEmail: 'cum.tphcm.audit@bank.vn',
      subject: '[AuditBGS CẢNH BÁO DEADLINE] Đôn đốc xử lý hồ sơ sai sót kiểm tra - Cụm TP.HCM',
      errorCount: 1,
      status: 'SUCCESS'
    }
  ]
};
