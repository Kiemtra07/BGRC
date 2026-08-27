// server/src/app.ts
import crypto5 from "node:crypto";
import path4 from "node:path";
import fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";

// shared/contracts/common.ts
import { z } from "zod";
var RISK_LEVELS = ["CAO", "TRUNG_BINH", "THAP"];
var BUSINESS_LINES = ["TIN_DUNG", "PHI_TIN_DUNG"];
var riskLevelLabels = {
  CAO: "Cao",
  TRUNG_BINH: "Trung b\xECnh",
  THAP: "Th\u1EA5p"
};
var businessLineLabels = {
  TIN_DUNG: "T\xEDn d\u1EE5ng",
  PHI_TIN_DUNG: "Phi t\xEDn d\u1EE5ng"
};
var PaginationQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc")
});

// shared/contracts/coplus-roles.ts
import { z as z2 } from "zod";
var COPLUS_ROLE_CODES = [
  "ROLE_BANLD",
  "ROLE_GDBTT",
  "ROLE_PGDBANTT",
  "ROLE_CBBANTT",
  "GD_KTGSTT",
  "PGD1_KTGSTT",
  "CB1_KTGSTT",
  "PGD2_KTGSTT",
  "CB2_KTGSTT",
  "CBHT_CN",
  "CB_GSKT_TH",
  "LD_CN",
  "LD_GSKT_TH",
  "ADMIN_HT"
];
var CoPlusRoleCodeSchema = z2.enum(COPLUS_ROLE_CODES);
var COPLUS_ROLE_CATALOG = [
  {
    code: "ROLE_BANLD",
    label: "Ban l\xE3nh \u0111\u1EA1o BIDV",
    group: "BAN_LANH_DAO",
    responsibility: "Tra c\u1EE9u ti\u1EBFn \u0111\u1ED9 kh\u1EAFc ph\u1EE5c, xem v\xE0 xu\u1EA5t b\xE1o c\xE1o to\xE0n h\xE0ng.",
    capabilities: ["VIEWER"]
  },
  {
    code: "ROLE_GDBTT",
    label: "Gi\xE1m \u0111\u1ED1c Ban/TT ngo\xE0i KT&GSTT",
    group: "BAN_TT_NGOAI_KTGSTT",
    responsibility: "Tra c\u1EE9u h\u1ED3 s\u01A1 kh\u1EAFc ph\u1EE5c thu\u1ED9c \u0111o\xE0n ki\u1EC3m tra \u0111\u01B0\u1EE3c ph\xE2n c\xF4ng.",
    capabilities: ["VIEWER"]
  },
  {
    code: "ROLE_PGDBANTT",
    label: "Ph\xF3 Gi\xE1m \u0111\u1ED1c Ban/TT ngo\xE0i KT&GSTT",
    group: "BAN_TT_NGOAI_KTGSTT",
    responsibility: "Tra c\u1EE9u h\u1ED3 s\u01A1 kh\u1EAFc ph\u1EE5c thu\u1ED9c \u0111o\xE0n ki\u1EC3m tra \u0111\u01B0\u1EE3c ph\xE2n c\xF4ng.",
    capabilities: ["VIEWER"]
  },
  {
    code: "ROLE_CBBANTT",
    label: "C\xE1n b\u1ED9 Ban/TT ngo\xE0i KT&GSTT",
    group: "BAN_TT_NGOAI_KTGSTT",
    responsibility: "Tra c\u1EE9u h\u1ED3 s\u01A1 kh\u1EAFc ph\u1EE5c thu\u1ED9c \u0111o\xE0n ki\u1EC3m tra \u0111\u01B0\u1EE3c ph\xE2n c\xF4ng.",
    capabilities: ["VIEWER"]
  },
  {
    code: "GD_KTGSTT",
    label: "Gi\xE1m \u0111\u1ED1c Ban KT&GSTT",
    group: "KTGSTT_THAM_GIA_DOAN",
    responsibility: "Ph\xEA duy\u1EC7t \u0111\xF3ng l\u1ED7i, ch\u1ED1t k\u1EBFt qu\u1EA3 kh\u1EAFc ph\u1EE5c c\u1EE7a \u0111o\xE0n ki\u1EC3m tra.",
    capabilities: ["INTERNAL_APPROVER", "SUPERVISOR"]
  },
  {
    code: "PGD1_KTGSTT",
    label: "Ph\xF3 Gi\xE1m \u0111\u1ED1c Ban KT&GSTT (tham gia \u0111o\xE0n)",
    group: "KTGSTT_THAM_GIA_DOAN",
    responsibility: "Ph\xEA duy\u1EC7t ho\u1EB7c chuy\u1EC3n tr\u1EA3 h\u1ED3 s\u01A1 kh\u1EAFc ph\u1EE5c c\u1EE7a \u0111o\xE0n m\xECnh ph\u1EE5 tr\xE1ch.",
    capabilities: ["INTERNAL_APPROVER"]
  },
  {
    code: "CB1_KTGSTT",
    label: "C\xE1n b\u1ED9 Ban KT&GSTT (tham gia \u0111o\xE0n)",
    group: "KTGSTT_THAM_GIA_DOAN",
    responsibility: "Chuy\u1EC3n sai s\xF3t t\u1EEB ti\u1EC3u bi\xEAn b\u1EA3n sang theo d\xF5i kh\u1EAFc ph\u1EE5c, c\u1EADp nh\u1EADt h\u1ED3 s\u01A1.",
    capabilities: ["INTERNAL_OFFICER"]
  },
  {
    code: "PGD2_KTGSTT",
    label: "Ph\xF3 Gi\xE1m \u0111\u1ED1c Ban KT&GSTT (kh\xF4ng tham gia \u0111o\xE0n)",
    group: "KTGSTT_KHONG_THAM_GIA_DOAN",
    responsibility: "Tra c\u1EE9u v\xE0 ph\xEA duy\u1EC7t thay khi \u0111\u01B0\u1EE3c ph\xE2n c\xF4ng.",
    capabilities: ["INTERNAL_APPROVER"]
  },
  {
    code: "CB2_KTGSTT",
    label: "C\xE1n b\u1ED9 Ban KT&GSTT (kh\xF4ng tham gia \u0111o\xE0n)",
    group: "KTGSTT_KHONG_THAM_GIA_DOAN",
    responsibility: "Tra c\u1EE9u h\u1ED3 s\u01A1, c\u1EADp nh\u1EADt khi \u0111\u01B0\u1EE3c ph\xE2n quy\u1EC1n.",
    capabilities: ["INTERNAL_OFFICER"]
  },
  {
    code: "CBHT_CN",
    label: "C\xE1n b\u1ED9 h\u1ED7 tr\u1EE3 chi nh\xE1nh",
    group: "HO_TRO_GIAM_SAT",
    responsibility: "Nh\u1EADp gi\u1EA3i tr\xECnh v\xE0 t\xE0i li\u1EC7u kh\u1EAFc ph\u1EE5c cho chi nh\xE1nh \u0111\u01B0\u1EE3c ph\xE2n c\xF4ng.",
    capabilities: ["BRANCH_INPUT"]
  },
  {
    code: "CB_GSKT_TH",
    label: "C\xE1n b\u1ED9 nh\xF3m Gi\xE1m s\xE1t H\u0110KT / T\u1ED5ng h\u1EE3p",
    group: "HO_TRO_GIAM_SAT",
    responsibility: "R\xE0 so\xE1t h\u1ED3 s\u01A1 kh\u1EAFc ph\u1EE5c tr\u01B0\u1EDBc khi tr\xECnh Kh\u1ED1i N\u1ED9i b\u1ED9, theo d\xF5i ti\u1EBFn \u0111\u1ED9 to\xE0n h\xE0ng.",
    capabilities: ["BRANCH_CONTROLLER"]
  },
  {
    code: "LD_CN",
    label: "L\xE3nh \u0111\u1EA1o chi nh\xE1nh",
    group: "CHI_NHANH",
    responsibility: "Ph\xEA duy\u1EC7t h\u1ED3 s\u01A1 kh\u1EAFc ph\u1EE5c khi tuy\u1EBFn duy\u1EC7t c\u1EE7a h\u1ED3 s\u01A1 y\xEAu c\u1EA7u c\u1EA5p l\xE3nh \u0111\u1EA1o chi nh\xE1nh.",
    capabilities: ["BRANCH_LEADER"]
  },
  {
    code: "LD_GSKT_TH",
    label: "L\xE3nh \u0111\u1EA1o nh\xF3m Gi\xE1m s\xE1t H\u0110KT / T\u1ED5ng h\u1EE3p",
    group: "HO_TRO_GIAM_SAT",
    responsibility: "Duy\u1EC7t k\u1EBFt qu\u1EA3 r\xE0 so\xE1t, theo d\xF5i t\u1ED5ng h\u1EE3p v\xE0 xu\u1EA5t b\xE1o c\xE1o to\xE0n h\xE0ng.",
    capabilities: ["SUPERVISOR"]
  },
  {
    code: "ADMIN_HT",
    label: "Qu\u1EA3n tr\u1ECB h\u1EC7 th\u1ED1ng",
    group: "QUAN_TRI",
    responsibility: "C\u1EA5u h\xECnh lo\u1EA1i b\xE1o c\xE1o, tham s\u1ED1, ng\u01B0\u1EDDi d\xF9ng v\xE0 ph\xE2n quy\u1EC1n.",
    capabilities: ["ADMIN"]
  }
];
var BY_CODE = new Map(COPLUS_ROLE_CATALOG.map((role) => [role.code, role]));
var capabilitiesForCoPlusRole = (code) => [...new Set(BY_CODE.get(code)?.capabilities ?? [])];
var inferCoPlusRole = (roles) => {
  const held = new Set(roles);
  const matches = COPLUS_ROLE_CATALOG.filter((role) => role.capabilities.every((capability) => held.has(capability))).sort((left, right) => right.capabilities.length - left.capabilities.length);
  return matches[0]?.code;
};

// shared/contracts/auth.ts
import { z as z3 } from "zod";
var LoginSchema = z3.object({
  username: z3.string().trim().min(2).max(100),
  password: z3.string().min(1).max(200)
});
var UserRoleSchema = z3.enum([
  "ADMIN",
  "SUPERVISOR",
  "INTERNAL_APPROVER",
  "INTERNAL_OFFICER",
  "BRANCH_CONTROLLER",
  "BRANCH_LEADER",
  "BRANCH_INPUT",
  "VIEWER"
]);
var CreateUserSchema = z3.object({
  username: z3.string().min(2).max(100).optional(),
  email: z3.string().email(),
  fullName: z3.string().trim().min(2).max(255),
  phone: z3.string().max(50).optional(),
  portal: z3.enum(["INTERNAL", "BRANCH"]),
  roles: z3.array(UserRoleSchema).min(1),
  coplusRole: CoPlusRoleCodeSchema.optional(),
  /**
   * Mật khẩu ban đầu. Bỏ trống thì hệ thống sinh mật khẩu tạm và trả về đúng một lần trong
   * phản hồi tạo tài khoản — không lưu ở dạng đọc được và không hiển thị lại lần nào nữa.
   */
  password: z3.string().min(12, "M\u1EADt kh\u1EA9u t\u1ED1i thi\u1EC3u 12 k\xFD t\u1EF1").max(200).optional(),
  primaryRole: UserRoleSchema,
  internalTeamId: z3.string().min(1).optional(),
  teamRole: z3.enum(["MEMBER", "LEAD"]).optional(),
  clusterName: z3.string().min(2).optional(),
  branchCode: z3.string().min(1).optional(),
  branchName: z3.string().min(2).optional(),
  department: z3.string().min(2).optional(),
  googleWorkspaceEmail: z3.string().email().optional(),
  isActive: z3.boolean().default(true)
}).superRefine((value, context) => {
  if (!value.roles.includes(value.primaryRole)) {
    context.addIssue({
      code: z3.ZodIssueCode.custom,
      path: ["primaryRole"],
      message: "primaryRole ph\u1EA3i n\u1EB1m trong roles"
    });
  }
  const branchRoles = /* @__PURE__ */ new Set(["BRANCH_INPUT", "BRANCH_CONTROLLER", "BRANCH_LEADER"]);
  const internalRoles = /* @__PURE__ */ new Set(["ADMIN", "SUPERVISOR", "INTERNAL_APPROVER", "INTERNAL_OFFICER"]);
  if (value.portal === "BRANCH" && value.roles.some((role) => internalRoles.has(role))) {
    context.addIssue({
      code: z3.ZodIssueCode.custom,
      path: ["roles"],
      message: "User chi nh\xE1nh kh\xF4ng \u0111\u01B0\u1EE3c mang vai tr\xF2 n\u1ED9i b\u1ED9"
    });
  }
  if (value.portal === "INTERNAL" && value.roles.some((role) => branchRoles.has(role))) {
    context.addIssue({
      code: z3.ZodIssueCode.custom,
      path: ["roles"],
      message: "User n\u1ED9i b\u1ED9 kh\xF4ng \u0111\u01B0\u1EE3c mang vai tr\xF2 chi nh\xE1nh"
    });
  }
  if (["BRANCH_CONTROLLER", "BRANCH_LEADER"].includes(value.primaryRole) && (!value.branchCode || !value.department)) {
    context.addIssue({
      code: z3.ZodIssueCode.custom,
      path: ["branchCode"],
      message: "Vai tr\xF2 ki\u1EC3m so\xE1t ho\u1EB7c l\xE3nh \u0111\u1EA1o chi nh\xE1nh ph\u1EA3i c\xF3 branchCode v\xE0 department"
    });
  }
  if (value.primaryRole === "BRANCH_INPUT" && (!value.branchCode || !value.department)) {
    context.addIssue({
      code: z3.ZodIssueCode.custom,
      path: ["branchCode"],
      message: "BRANCH_INPUT ph\u1EA3i c\xF3 branchCode v\xE0 department"
    });
  }
  if (value.primaryRole === "INTERNAL_OFFICER" && (!value.internalTeamId || value.teamRole !== "MEMBER")) {
    context.addIssue({
      code: z3.ZodIssueCode.custom,
      path: ["internalTeamId"],
      message: "C\xE1n b\u1ED9 n\u1ED9i b\u1ED9 ph\u1EA3i thu\u1ED9c m\u1ED9t nh\xF3m v\u1EDBi vai tr\xF2 th\xE0nh vi\xEAn"
    });
  }
  if (value.primaryRole === "INTERNAL_APPROVER" && (!value.internalTeamId || value.teamRole !== "LEAD")) {
    context.addIssue({
      code: z3.ZodIssueCode.custom,
      path: ["teamRole"],
      message: "Ng\u01B0\u1EDDi ki\u1EC3m so\xE1t duy\u1EC7t c\u1EE7a nh\xF3m ph\u1EA3i l\xE0 tr\u01B0\u1EDFng nh\xF3m"
    });
  }
  if (value.teamRole && !value.internalTeamId) {
    context.addIssue({
      code: z3.ZodIssueCode.custom,
      path: ["internalTeamId"],
      message: "teamRole y\xEAu c\u1EA7u internalTeamId"
    });
  }
  if (value.coplusRole) {
    const missing2 = capabilitiesForCoPlusRole(value.coplusRole).filter((capability) => !value.roles.includes(capability));
    if (missing2.length) {
      context.addIssue({
        code: z3.ZodIssueCode.custom,
        path: ["coplusRole"],
        message: `Vai tr\xF2 ${value.coplusRole} c\u1EA7n th\xEAm quy\u1EC1n: ${missing2.join(", ")}`
      });
    }
  }
});
var ResetUserPasswordSchema = z3.object({
  password: z3.string().min(12, "M\u1EADt kh\u1EA9u t\u1ED1i thi\u1EC3u 12 k\xFD t\u1EF1").max(200).optional()
});

// shared/contracts/org.ts
import { z as z4 } from "zod";
var CreateOrgUnitSchema = z4.object({
  code: z4.string().min(1).max(50),
  name: z4.string().min(1).max(200),
  type: z4.enum(["HEAD_OFFICE", "INTERNAL_TEAM", "CLUSTER", "BRANCH", "DEPARTMENT"]),
  // IDs are opaque strings at the HTTP boundary; PostgreSQL uses UUIDs while local mode uses readable seed IDs.
  parentId: z4.string().min(1).optional(),
  leaderUserId: z4.string().min(1).optional(),
  isActive: z4.boolean().default(true),
  metadata: z4.record(z4.any()).optional()
});
var UpdateOrgUnitSchema = z4.object({
  code: z4.string().trim().min(1).max(50).optional(),
  name: z4.string().trim().min(1).max(200).optional(),
  parentId: z4.string().trim().min(1).nullable().optional(),
  leaderUserId: z4.string().trim().min(1).nullable().optional(),
  isActive: z4.boolean().optional(),
  metadata: z4.record(z4.any()).nullable().optional(),
  expectedUpdatedAt: z4.string().datetime()
}).refine((value) => Object.keys(value).some((key) => key !== "expectedUpdatedAt"), {
  message: "C\u1EA7n c\xF3 \xEDt nh\u1EA5t m\u1ED9t thay \u0111\u1ED5i cho \u0111\u01A1n v\u1ECB."
});

// shared/contracts/channels.ts
import { z as z5 } from "zod";
var UserRoleSchema2 = z5.enum([
  "ADMIN",
  "SUPERVISOR",
  "INTERNAL_APPROVER",
  "INTERNAL_OFFICER",
  "BRANCH_CONTROLLER",
  "BRANCH_LEADER",
  "BRANCH_INPUT",
  "VIEWER"
]);
var WorkflowStatusSchema = z5.enum([
  "PENDING",
  "SUBMITTED_BRANCH",
  "SUBMITTED_BRANCH_LEADER",
  "SUBMITTED_INTERNAL",
  "REJECTED",
  "WAIVED_RESOLVED"
]);
var DynamicFieldDefinitionSchema = z5.object({
  fieldKey: z5.string().trim().min(2).max(80).regex(/^[a-z][a-z0-9_]*$/, "M\xE3 tr\u01B0\u1EDDng ch\u1EC9 g\u1ED3m ch\u1EEF th\u01B0\u1EDDng, s\u1ED1 v\xE0 d\u1EA5u g\u1EA1ch d\u01B0\u1EDBi."),
  label: z5.string().trim().min(2).max(150),
  dataType: z5.enum(["string", "number", "currency", "date", "select", "file", "textarea"]),
  isRequired: z5.boolean(),
  isSystemCoreField: z5.boolean().optional(),
  coreFieldRole: z5.enum([
    "CUSTOMER_IDENTIFIER",
    "ERROR_CODE",
    "ERROR_TITLE",
    "BRANCH_CODE",
    "CLUSTER_NAME",
    "EXPOSURE_AMOUNT",
    "DEADLINE"
  ]).optional(),
  dropdownOptions: z5.array(z5.object({ label: z5.string().trim().min(1), value: z5.string().trim().min(1) })).optional(),
  excelHeaderAliases: z5.array(z5.string().trim().min(1)).default([]),
  displayOrder: z5.number().int().nonnegative(),
  showInTableGrid: z5.boolean(),
  helpText: z5.string().trim().max(500).optional(),
  excelColumnIndex: z5.number().int().min(1).max(1e3).optional(),
  isEmphasized: z5.boolean().optional()
}).superRefine((field, context) => {
  if (field.dataType === "select" && !field.dropdownOptions?.length) {
    context.addIssue({ code: z5.ZodIssueCode.custom, path: ["dropdownOptions"], message: "Tr\u01B0\u1EDDng l\u1EF1a ch\u1ECDn c\u1EA7n \xEDt nh\u1EA5t m\u1ED9t ph\u01B0\u01A1ng \xE1n." });
  }
  if (field.dataType === "file" && field.isRequired) {
    context.addIssue({ code: z5.ZodIssueCode.custom, path: ["isRequired"], message: "T\u1EC7p minh ch\u1EE9ng \u0111\u01B0\u1EE3c t\u1EA3i sau khi t\u1EA1o h\u1ED3 s\u01A1 n\xEAn kh\xF4ng th\u1EC3 \u0111\u1EB7t b\u1EAFt bu\u1ED9c trong form." });
  }
});
var ReportFormBlockSchema = z5.object({
  id: z5.string().trim().min(1).max(100),
  type: z5.enum(["CAMPAIGN_CONTEXT", "SECTION", "SUBSECTION", "TEXT", "FIELD", "FIELD_GROUP", "DIVIDER"]),
  title: z5.string().trim().max(200).optional(),
  content: z5.string().trim().max(2e3).optional(),
  fieldKey: z5.string().trim().optional(),
  fieldKeys: z5.array(z5.string().trim().min(1)).max(30).optional(),
  width: z5.enum(["FULL", "HALF", "THIRD"])
}).superRefine((block, context) => {
  if (block.type === "FIELD" && !block.fieldKey) context.addIssue({ code: z5.ZodIssueCode.custom, path: ["fieldKey"], message: "Block tr\u01B0\u1EDDng nh\u1EADp ph\u1EA3i g\u1EAFn v\u1EDBi m\u1ED9t tr\u01B0\u1EDDng." });
  if (block.type === "FIELD_GROUP" && !block.fieldKeys?.length) context.addIssue({ code: z5.ZodIssueCode.custom, path: ["fieldKeys"], message: "Nh\xF3m tr\u01B0\u1EDDng ph\u1EA3i c\xF3 \xEDt nh\u1EA5t m\u1ED9t tr\u01B0\u1EDDng." });
});
var ReportFormTemplateSchema = z5.object({
  name: z5.string().trim().min(2).max(200),
  source: z5.enum(["MANUAL", "EXCEL"]),
  sourceFileName: z5.string().trim().max(255).optional(),
  sheetName: z5.string().trim().max(100).optional(),
  presentationMode: z5.enum(["CASE_REVIEW", "EXCEL_GRID", "FORM_ONLY"]).default("CASE_REVIEW"),
  allowEvidenceAttachments: z5.boolean().default(true),
  blocks: z5.array(ReportFormBlockSchema).max(150)
});
var DynamicSchemaConfigSchema = z5.object({
  tableName: z5.string().trim().min(1).max(100),
  fields: z5.array(DynamicFieldDefinitionSchema).max(100),
  excelHeaderRowIndex: z5.number().int().min(1).max(100),
  dataStartRowIndex: z5.number().int().min(2).max(1e3),
  formTemplate: ReportFormTemplateSchema.optional()
}).superRefine((schema, context) => {
  const keys = schema.fields.map((field) => field.fieldKey);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: z5.ZodIssueCode.custom, path: ["fields"], message: "M\xE3 tr\u01B0\u1EDDng kh\xF4ng \u0111\u01B0\u1EE3c tr\xF9ng nhau." });
  }
  const coreRoles = schema.fields.flatMap((field) => field.coreFieldRole ? [field.coreFieldRole] : []);
  if (new Set(coreRoles).size !== coreRoles.length) {
    context.addIssue({ code: z5.ZodIssueCode.custom, path: ["fields"], message: "M\u1ED7i tr\u01B0\u1EDDng h\u1EC7 th\u1ED1ng ch\u1EC9 \u0111\u01B0\u1EE3c \xE1nh x\u1EA1 m\u1ED9t l\u1EA7n." });
  }
  const blockIds = schema.formTemplate?.blocks.map((block) => block.id) ?? [];
  if (new Set(blockIds).size !== blockIds.length) {
    context.addIssue({ code: z5.ZodIssueCode.custom, path: ["formTemplate", "blocks"], message: "M\xE3 block kh\xF4ng \u0111\u01B0\u1EE3c tr\xF9ng nhau." });
  }
  const knownFields = new Set(keys);
  schema.formTemplate?.blocks.forEach((block, index) => {
    const references = block.type === "FIELD" ? [block.fieldKey] : block.type === "FIELD_GROUP" ? block.fieldKeys : [];
    references?.filter(Boolean).forEach((fieldKey) => {
      if (!knownFields.has(fieldKey)) context.addIssue({ code: z5.ZodIssueCode.custom, path: ["formTemplate", "blocks", index], message: "Block \u0111ang g\u1EAFn v\u1EDBi tr\u01B0\u1EDDng kh\xF4ng t\u1ED3n t\u1EA1i." });
    });
  });
});
var ButtonActionConfigSchema = z5.object({
  buttonId: z5.string().trim().min(1),
  buttonLabel: z5.string().trim().min(2).max(100),
  buttonColor: z5.enum(["green", "red", "blue", "amber", "purple", "slate"]),
  targetStatusCode: WorkflowStatusSchema,
  allowedRoles: z5.array(UserRoleSchema2).min(1),
  requireReasonNotes: z5.boolean(),
  requireFileAttachment: z5.boolean().optional(),
  sendEmailNotification: z5.boolean(),
  emailRecipientRoles: z5.array(UserRoleSchema2)
});
var DynamicWorkflowStageSchema = z5.object({
  stageId: z5.string().trim().min(1),
  stageName: z5.string().trim().min(2).max(150),
  statusCode: WorkflowStatusSchema,
  allowedRoles: z5.array(UserRoleSchema2).min(1),
  availableButtons: z5.array(ButtonActionConfigSchema),
  maxExecutionHours: z5.number().int().positive().max(8760).optional()
});
var DynamicWorkflowConfigSchema = z5.object({
  id: z5.string().trim().min(1),
  channelId: z5.string(),
  workflowType: z5.enum(["ONE_TIER", "TWO_TIER", "THREE_TIER"]),
  stages: z5.array(DynamicWorkflowStageSchema).min(2).max(4)
});
var DynamicSlaConfigSchema = z5.object({
  defaultDays: z5.number().int().min(1).max(365),
  highRiskDays: z5.number().int().min(1).max(365),
  mediumRiskDays: z5.number().int().min(1).max(365),
  lowRiskDays: z5.number().int().min(1).max(365),
  escalationAfterDaysOverdue: z5.number().int().min(0).max(90),
  reminderDaysBefore: z5.array(z5.number().int().min(0).max(365)).max(20)
});
var ReportChannelIntegrationConfigSchema = z5.object({
  googleSheets: z5.object({
    enabled: z5.boolean(),
    spreadsheetId: z5.string().trim().max(300).optional(),
    sheetName: z5.string().trim().min(1).max(100),
    syncMode: z5.enum(["APPEND", "UPSERT"])
  }),
  email: z5.object({
    enabled: z5.boolean(),
    sendOnSubmission: z5.boolean(),
    sendBeforeDeadline: z5.boolean(),
    sendWhenOverdue: z5.boolean(),
    sendTime: z5.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    recipientRoles: z5.array(UserRoleSchema2),
    additionalRecipients: z5.array(z5.string().email()).max(50),
    subjectTemplate: z5.string().trim().min(3).max(250)
  })
});
var ReportChannelWritableFieldsSchema = z5.object({
  code: z5.string().trim().min(2).max(100).regex(/^[A-Z0-9_]+$/, "M\xE3 lo\u1EA1i b\xE1o c\xE1o ch\u1EC9 g\u1ED3m ch\u1EEF in hoa, s\u1ED1 v\xE0 d\u1EA5u g\u1EA1ch d\u01B0\u1EDBi."),
  name: z5.string().trim().min(3).max(255),
  description: z5.string().trim().max(2e3).default(""),
  category: z5.enum(["REGULAR_AUDIT", "THEMATIC_AUDIT", "COMPLIANCE_AML", "OPERATIONAL_RISK", "CREDIT_INSPECTION", "BRANCH_REPORT"]),
  icon: z5.string().trim().min(1).max(50).default("FileSpreadsheet"),
  badgeColor: z5.string().trim().min(1).max(50).default("teal"),
  inputMethods: z5.array(z5.enum(["EXCEL_IMPORT", "WEB_FORM", "API"])).min(1),
  issuingDepartment: z5.string().trim().min(2).max(255),
  isActive: z5.boolean().default(true),
  schemaConfig: DynamicSchemaConfigSchema,
  workflowConfig: DynamicWorkflowConfigSchema,
  slaConfig: DynamicSlaConfigSchema,
  integrationConfig: ReportChannelIntegrationConfigSchema
});
var CreateReportChannelSchema = ReportChannelWritableFieldsSchema;
var UpdateReportChannelSchema = ReportChannelWritableFieldsSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "C\u1EA7n \xEDt nh\u1EA5t m\u1ED9t n\u1ED9i dung c\u1EADp nh\u1EADt."
);

// shared/contracts/evidence.ts
import { z as z6 } from "zod";
var RevokeEvidenceSchema = z6.object({
  reason: z6.string().trim().min(5).max(500)
});
var EvidenceUploadMetadataSchema = z6.object({
  fileName: z6.string().trim().min(1).max(255),
  mimeType: z6.string().trim().min(1).max(150),
  fileSize: z6.number().int().positive().max(25 * 1024 * 1024),
  sha256Checksum: z6.string().regex(/^[a-f0-9]{64}$/i)
});
var CreateEvidenceUploadSessionSchema = EvidenceUploadMetadataSchema;
var CompleteEvidenceDirectUploadSchema = EvidenceUploadMetadataSchema.extend({
  driveFileId: z6.string().trim().min(1).max(255)
});
var canManageEvidenceAtBranch = (status) => status === "PENDING" || status === "REJECTED";

// shared/contracts/workflow.ts
import { z as z7 } from "zod";
var SubmitBranchCommandSchema = z7.object({
  expectedVersion: z7.number().int().min(1),
  resolutionNotes: z7.string().min(5, "Gi\u1EA3i tr\xECnh kh\u1EAFc ph\u1EE5c b\u1EAFt bu\u1ED9c t\u1ED1i thi\u1EC3u 5 k\xFD t\u1EF1")
});
var BranchControlApproveCommandSchema = z7.object({
  expectedVersion: z7.number().int().min(1),
  notes: z7.string().optional()
});
var BranchControlRejectCommandSchema = z7.object({
  expectedVersion: z7.number().int().min(1),
  reason: z7.string().min(5, "L\xFD do tr\u1EA3 v\u1EC1 b\u1EAFt bu\u1ED9c t\u1ED1i thi\u1EC3u 5 k\xFD t\u1EF1")
});
var BranchLeaderApproveCommandSchema = z7.object({
  expectedVersion: z7.number().int().min(1),
  notes: z7.string().optional()
});
var BranchLeaderRejectCommandSchema = z7.object({
  expectedVersion: z7.number().int().min(1),
  reason: z7.string().min(5, "L\xFD do tr\u1EA3 v\u1EC1 b\u1EAFt bu\u1ED9c t\u1ED1i thi\u1EC3u 5 k\xFD t\u1EF1")
});
var SetFindingSpecialCaseSchema = z7.object({
  isSpecialCase: z7.boolean()
});
var InternalWaiveCommandSchema = z7.object({
  expectedVersion: z7.number().int().min(1),
  decisionNumber: z7.string().min(2, "S\u1ED1 c\xF4ng v\u0103n/quy\u1EBFt \u0111\u1ECBnh b\u1ECF l\u1ED7i b\u1EAFt bu\u1ED9c"),
  notes: z7.string().optional()
});
var InternalRejectCommandSchema = z7.object({
  expectedVersion: z7.number().int().min(1),
  reason: z7.string().min(5, "L\xFD do t\u1EEB ch\u1ED1i b\u1ECF l\u1ED7i b\u1EAFt bu\u1ED9c t\u1ED1i thi\u1EC3u 5 k\xFD t\u1EF1"),
  regulatoryBasis: z7.string().optional()
});

// shared/contracts/sla.ts
import { z as z8 } from "zod";
var CreateSlaExtensionRequestSchema = z8.object({
  requestedDeadline: z8.string().regex(/^\d{4}-\d{2}-\d{2}$/, "\u0110\u1ECBnh d\u1EA1ng ng\xE0y YYYY-MM-DD"),
  reason: z8.string().min(10, "L\xFD do xin gia h\u1EA1n b\u1EAFt bu\u1ED9c t\u1ED1i thi\u1EC3u 10 k\xFD t\u1EF1"),
  evidenceDriveUrl: z8.string().url().optional()
});
var DecideSlaExtensionSchema = z8.object({
  action: z8.enum(["APPROVE", "REJECT"]),
  notes: z8.string().optional()
});

// shared/contracts/ingestion.ts
import { z as z9 } from "zod";
var CalendarDateSchema = z9.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ng\xE0y ph\u1EA3i theo \u0111\u1ECBnh d\u1EA1ng YYYY-MM-DD").refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, "Ng\xE0y l\u1ECBch kh\xF4ng h\u1EE3p l\u1EC7");
var WebFormFindingSchema = z9.object({
  campaignId: z9.string().min(1).optional(),
  channelId: z9.string().min(1),
  cif: z9.string().min(3).max(20),
  customerName: z9.string().min(2).max(255),
  clusterName: z9.string().min(2),
  branchCode: z9.string().min(1),
  branchName: z9.string().min(2),
  department: z9.string().optional(),
  decisionNo: z9.string().optional(),
  auditDate: CalendarDateSchema.optional(),
  deadlineDate: CalendarDateSchema.optional(),
  loanGroup: z9.string().trim().min(1).optional(),
  collateralValue: z9.number().nonnegative().optional(),
  loanPurpose: z9.string().trim().min(1).max(2e3).optional(),
  errorCode: z9.string().min(2),
  errorGroup: z9.string().optional(),
  errorTitle: z9.string().min(3),
  description: z9.string().min(5),
  quantity: z9.number().int().positive().optional(),
  exposureAmount: z9.number().nonnegative().default(0),
  // Provenance carried over from the upstream CoPlus inspection record.
  inspectionTeamCode: z9.string().trim().min(1).max(50).optional(),
  sourceRecordCode: z9.string().trim().min(1).max(60).optional(),
  businessLine: z9.enum(BUSINESS_LINES).optional(),
  riskLevel: z9.enum(RISK_LEVELS).optional(),
  penaltyProposalCode: z9.string().trim().min(1).max(30).optional(),
  referenceDocument: z9.string().trim().min(1).max(500).optional(),
  creditBalance: z9.number().nonnegative().optional(),
  officerName: z9.string().optional(),
  deptHeadName: z9.string().optional(),
  inspectorName: z9.string().optional(),
  customPayload: z9.record(z9.any()).optional()
});
var BulkFindingImportSchema = z9.object({
  sourceFileName: z9.string().trim().min(1).max(255),
  rows: z9.array(WebFormFindingSchema).min(1).max(5e3)
});

// shared/contracts/findings.ts
import { z as z10 } from "zod";
var WorkspaceTargetCommandSchema = z10.object({
  targetType: z10.enum(["CLUSTER", "BRANCH", "CUSTOMER"]),
  clusterName: z10.string().trim().min(1).max(200).optional(),
  branchCode: z10.string().trim().min(1).max(50).optional(),
  cif: z10.string().trim().min(1).max(100).optional()
}).superRefine((value, context) => {
  if (value.targetType === "CLUSTER" && !value.clusterName) context.addIssue({ code: z10.ZodIssueCode.custom, path: ["clusterName"], message: "C\u1EE5m \u0111\u1ECBa b\xE0n l\xE0 b\u1EAFt bu\u1ED9c." });
  if (value.targetType === "BRANCH" && !value.branchCode) context.addIssue({ code: z10.ZodIssueCode.custom, path: ["branchCode"], message: "Chi nh\xE1nh l\xE0 b\u1EAFt bu\u1ED9c." });
  if (value.targetType === "CUSTOMER" && (!value.branchCode || !value.cif)) context.addIssue({ code: z10.ZodIssueCode.custom, path: ["cif"], message: "Kh\xE1ch h\xE0ng v\xE0 chi nh\xE1nh l\xE0 b\u1EAFt bu\u1ED9c." });
});
var SetWorkspacePrioritySchema = z10.object({
  isPriority: z10.boolean()
});
var CreateFindingSubItemSchema = z10.object({
  content: z10.string().trim().min(5).max(1e3)
});
var ReviewFindingSubItemsSchema = z10.object({
  decisions: z10.array(z10.object({
    subItemId: z10.string().min(1),
    decision: z10.enum(["ACCEPT", "RETURN"])
  })).min(1),
  reviewNote: z10.string().trim().min(5).max(2e3)
});

// shared/contracts/dashboards.ts
import { z as z11 } from "zod";
var ReportFilterSchema = z11.object({
  branchCode: z11.string().trim().min(1).max(50).optional(),
  department: z11.string().trim().min(1).max(255).optional(),
  workflowStatus: z11.enum(["PENDING", "SUBMITTED_BRANCH", "SUBMITTED_BRANCH_LEADER", "SUBMITTED_INTERNAL", "REJECTED", "WAIVED_RESOLVED"]).optional(),
  errorCode: z11.string().trim().min(2).max(50).optional(),
  dateFrom: z11.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z11.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
}).superRefine((value, context) => {
  if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
    context.addIssue({ code: z11.ZodIssueCode.custom, path: ["dateTo"], message: "dateTo ph\u1EA3i l\u1EDBn h\u01A1n ho\u1EB7c b\u1EB1ng dateFrom" });
  }
});
var ReportColumnSchema = z11.enum([
  "cif",
  "customerName",
  "clusterName",
  "branchCode",
  "branchName",
  "department",
  "officerName",
  "errorCode",
  "errorTitle",
  "description",
  "workflowStatus",
  "creditBalance",
  "exposureAmount",
  "deadlineDate"
]);
var REPORT_FIELD_KEYS = [
  "dimension.channel",
  "dimension.campaign",
  "dimension.campaign_decision",
  "dimension.cluster",
  "dimension.branch",
  "dimension.department",
  "dimension.cif",
  "dimension.customer",
  "dimension.officer",
  "dimension.error_code",
  "dimension.error_group",
  "dimension.workflow_status",
  "dimension.sla_status",
  // Carried over from the CoPlus inspection record so its Report Builder columns are reproducible.
  "dimension.inspection_team",
  "dimension.source_record",
  "dimension.business_line",
  "dimension.risk_level",
  "dimension.penalty_proposal",
  "date.audit",
  "date.deadline",
  "measure.credit_balance",
  "measure.collateral_value",
  "measure.exposure",
  "measure.quantity",
  "flag.overdue"
];
var ReportFieldKeySchema = z11.enum(REPORT_FIELD_KEYS);
var REPORT_OPERATOR_KEYS = [
  "op.eq",
  "op.neq",
  "op.contains",
  "op.in",
  "op.gte",
  "op.lte",
  "op.between",
  "op.is_true",
  "op.is_false"
];
var ReportOperatorKeySchema = z11.enum(REPORT_OPERATOR_KEYS);
var REPORT_METRIC_KEYS = [
  "metric.customer_count",
  "metric.finding_count",
  "metric.exposure_sum",
  "metric.credit_balance_sum",
  "metric.collateral_value_sum",
  "metric.quantity_sum",
  "metric.overdue_count",
  "metric.resolved_count",
  "metric.remediation_rate"
];
var ReportMetricKeySchema = z11.enum(REPORT_METRIC_KEYS);
var TEXT_OPERATORS = ["op.eq", "op.neq", "op.contains", "op.in"];
var ENUM_OPERATORS = ["op.eq", "op.neq", "op.in"];
var RANGE_OPERATORS = ["op.eq", "op.neq", "op.gte", "op.lte", "op.between"];
var REPORT_FIELD_CATALOG = [
  { key: "dimension.channel", label: "K\xEAnh d\u1EEF li\u1EC7u", category: "DIMENSION", valueType: "ENUM", operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: "dimension.campaign", label: "Chuy\xEAn \u0111\u1EC1", category: "DIMENSION", valueType: "ENUM", operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: "dimension.campaign_decision", label: "Quy\u1EBFt \u0111\u1ECBnh chuy\xEAn \u0111\u1EC1", category: "DIMENSION", valueType: "TEXT", operators: TEXT_OPERATORS, groupable: true, exportable: true },
  { key: "dimension.cluster", label: "C\u1EE5m \u0111\u1ECBa b\xE0n", category: "DIMENSION", valueType: "ENUM", operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: "dimension.branch", label: "Chi nh\xE1nh", category: "DIMENSION", valueType: "ENUM", operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: "dimension.department", label: "Ph\xF2ng / PGD", category: "DIMENSION", valueType: "ENUM", operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: "dimension.cif", label: "CIF", category: "DIMENSION", valueType: "TEXT", operators: TEXT_OPERATORS, groupable: true, exportable: true },
  { key: "dimension.customer", label: "T\xEAn kh\xE1ch h\xE0ng", category: "DIMENSION", valueType: "TEXT", operators: TEXT_OPERATORS, groupable: true, exportable: true },
  { key: "dimension.officer", label: "C\xE1n b\u1ED9 QLKH", category: "DIMENSION", valueType: "TEXT", operators: TEXT_OPERATORS, groupable: true, exportable: true },
  { key: "dimension.error_code", label: "M\xE3 l\u1ED7i", category: "DIMENSION", valueType: "ENUM", operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: "dimension.error_group", label: "Nh\xF3m l\u1ED7i", category: "DIMENSION", valueType: "ENUM", operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: "dimension.workflow_status", label: "Tr\u1EA1ng th\xE1i x\u1EED l\xFD", category: "DIMENSION", valueType: "ENUM", operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: "dimension.sla_status", label: "Tr\u1EA1ng th\xE1i SLA", category: "DIMENSION", valueType: "ENUM", operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: "dimension.inspection_team", label: "M\xE3 \u0111o\xE0n ki\u1EC3m tra", category: "DIMENSION", valueType: "ENUM", operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: "dimension.source_record", label: "M\xE3 ti\u1EC3u bi\xEAn b\u1EA3n", category: "DIMENSION", valueType: "TEXT", operators: TEXT_OPERATORS, groupable: true, exportable: true },
  { key: "dimension.business_line", label: "Lo\u1EA1i nghi\u1EC7p v\u1EE5", category: "DIMENSION", valueType: "ENUM", operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: "dimension.risk_level", label: "M\u1EE9c \u0111\u1ED9 r\u1EE7i ro", category: "DIMENSION", valueType: "ENUM", operators: ENUM_OPERATORS, groupable: true, exportable: true },
  { key: "dimension.penalty_proposal", label: "\u0110\u1EC1 xu\u1EA5t x\u1EED ph\u1EA1t", category: "DIMENSION", valueType: "TEXT", operators: TEXT_OPERATORS, groupable: true, exportable: true },
  { key: "date.audit", label: "Ng\xE0y ki\u1EC3m tra", category: "DATE", valueType: "DATE", operators: RANGE_OPERATORS, groupable: true, exportable: true },
  { key: "date.deadline", label: "H\u1EA1n x\u1EED l\xFD", category: "DATE", valueType: "DATE", operators: RANGE_OPERATORS, groupable: true, exportable: true },
  { key: "measure.credit_balance", label: "D\u01B0 n\u1EE3", category: "MEASURE", valueType: "NUMBER", operators: RANGE_OPERATORS, groupable: false, exportable: true },
  { key: "measure.collateral_value", label: "Gi\xE1 tr\u1ECB TSB\u0110", category: "MEASURE", valueType: "NUMBER", operators: RANGE_OPERATORS, groupable: false, exportable: true },
  { key: "measure.exposure", label: "Gi\xE1 tr\u1ECB \u1EA3nh h\u01B0\u1EDFng", category: "MEASURE", valueType: "NUMBER", operators: RANGE_OPERATORS, groupable: false, exportable: true },
  { key: "measure.quantity", label: "S\u1ED1 l\u01B0\u1EE3ng sai s\xF3t", category: "MEASURE", valueType: "NUMBER", operators: RANGE_OPERATORS, groupable: false, exportable: true },
  { key: "flag.overdue", label: "Qu\xE1 h\u1EA1n", category: "FLAG", valueType: "BOOLEAN", operators: ["op.is_true", "op.is_false"], groupable: true, exportable: true }
];
var REPORT_OPERATOR_CATALOG = [
  { key: "op.eq", label: "B\u1EB1ng", requires: "VALUE" },
  { key: "op.neq", label: "Kh\xE1c", requires: "VALUE" },
  { key: "op.contains", label: "C\xF3 ch\u1EE9a", requires: "VALUE" },
  { key: "op.in", label: "Thu\u1ED9c danh s\xE1ch", requires: "VALUES" },
  { key: "op.gte", label: "L\u1EDBn h\u01A1n ho\u1EB7c b\u1EB1ng", requires: "VALUE" },
  { key: "op.lte", label: "Nh\u1ECF h\u01A1n ho\u1EB7c b\u1EB1ng", requires: "VALUE" },
  { key: "op.between", label: "Trong kho\u1EA3ng", requires: "RANGE" },
  { key: "op.is_true", label: "\u0110\xFAng", requires: "NONE" },
  { key: "op.is_false", label: "Sai", requires: "NONE" }
];
var REPORT_METRIC_CATALOG = [
  { key: "metric.customer_count", label: "Kh\xE1ch h\xE0ng", unit: "COUNT" },
  { key: "metric.finding_count", label: "M\xE3 l\u1ED7i", unit: "COUNT" },
  { key: "metric.exposure_sum", label: "T\u1ED5ng gi\xE1 tr\u1ECB \u1EA3nh h\u01B0\u1EDFng", unit: "MILLION_VND" },
  { key: "metric.credit_balance_sum", label: "T\u1ED5ng d\u01B0 n\u1EE3 kh\xE1ch h\xE0ng", unit: "MILLION_VND" },
  { key: "metric.collateral_value_sum", label: "T\u1ED5ng gi\xE1 tr\u1ECB TSB\u0110", unit: "MILLION_VND" },
  { key: "metric.quantity_sum", label: "T\u1ED5ng s\u1ED1 l\u01B0\u1EE3ng sai s\xF3t", unit: "COUNT" },
  { key: "metric.overdue_count", label: "Sai s\xF3t qu\xE1 h\u1EA1n", unit: "COUNT" },
  { key: "metric.resolved_count", label: "Sai s\xF3t \u0111\xE3 \u0111\xF3ng", unit: "COUNT" },
  { key: "metric.remediation_rate", label: "T\u1EF7 l\u1EC7 kh\u1EAFc ph\u1EE5c", unit: "PERCENT" }
];
var firstDuplicateLabel = (labels2) => {
  const seen = /* @__PURE__ */ new Set();
  for (const label of labels2) {
    const key = label.trim().toLocaleLowerCase("vi-VN");
    if (seen.has(key)) return label;
    seen.add(key);
  }
  return void 0;
};
var ReportCatalogFieldConfigurationInputSchema = z11.object({
  key: ReportFieldKeySchema,
  label: z11.string().trim().min(1).max(100),
  isActive: z11.boolean(),
  groupable: z11.boolean(),
  exportable: z11.boolean(),
  defaultExport: z11.boolean(),
  sortOrder: z11.number().int().min(0).max(999)
});
var ReportCatalogMetricConfigurationInputSchema = z11.object({
  key: ReportMetricKeySchema,
  label: z11.string().trim().min(1).max(100),
  isActive: z11.boolean(),
  sortOrder: z11.number().int().min(0).max(999)
});
var UpdateReportCatalogConfigurationSchema = z11.object({
  expectedVersion: z11.number().int().min(1),
  fields: z11.array(ReportCatalogFieldConfigurationInputSchema).length(REPORT_FIELD_KEYS.length),
  metrics: z11.array(ReportCatalogMetricConfigurationInputSchema).length(REPORT_METRIC_KEYS.length)
}).superRefine((configuration, context) => {
  const fieldKeys = new Set(configuration.fields.map((field) => field.key));
  const metricKeys = new Set(configuration.metrics.map((metric) => metric.key));
  if (fieldKeys.size !== REPORT_FIELD_KEYS.length) {
    context.addIssue({ code: z11.ZodIssueCode.custom, path: ["fields"], message: "Danh s\xE1ch tr\u01B0\u1EDDng b\xE1o c\xE1o ph\u1EA3i \u0111\u1EA7y \u0111\u1EE7 v\xE0 kh\xF4ng \u0111\u01B0\u1EE3c l\u1EB7p" });
  }
  if (metricKeys.size !== REPORT_METRIC_KEYS.length) {
    context.addIssue({ code: z11.ZodIssueCode.custom, path: ["metrics"], message: "Danh s\xE1ch ch\u1EC9 s\u1ED1 b\xE1o c\xE1o ph\u1EA3i \u0111\u1EA7y \u0111\u1EE7 v\xE0 kh\xF4ng \u0111\u01B0\u1EE3c l\u1EB7p" });
  }
  configuration.fields.forEach((field, index) => {
    const base = REPORT_FIELD_CATALOG.find((item) => item.key === field.key);
    if (field.groupable && !base.groupable) {
      context.addIssue({ code: z11.ZodIssueCode.custom, path: ["fields", index, "groupable"], message: "Tr\u01B0\u1EDDng n\xE0y kh\xF4ng h\u1ED7 tr\u1EE3 ph\xE2n nh\xF3m" });
    }
    if (field.exportable && !base.exportable) {
      context.addIssue({ code: z11.ZodIssueCode.custom, path: ["fields", index, "exportable"], message: "Tr\u01B0\u1EDDng n\xE0y kh\xF4ng h\u1ED7 tr\u1EE3 xu\u1EA5t d\u1EEF li\u1EC7u" });
    }
    if (field.defaultExport && (!field.isActive || !field.exportable)) {
      context.addIssue({ code: z11.ZodIssueCode.custom, path: ["fields", index, "defaultExport"], message: "C\u1ED9t xu\u1EA5t m\u1EB7c \u0111\u1ECBnh ph\u1EA3i \u0111ang b\u1EADt v\xE0 \u0111\u01B0\u1EE3c ph\xE9p xu\u1EA5t" });
    }
  });
  if (!configuration.fields.some((field) => field.isActive && field.groupable)) {
    context.addIssue({ code: z11.ZodIssueCode.custom, path: ["fields"], message: "C\u1EA7n \xEDt nh\u1EA5t m\u1ED9t tr\u01B0\u1EDDng d\xF9ng \u0111\u1EC3 xem theo nh\xF3m" });
  }
  if (!configuration.fields.some((field) => field.isActive && field.defaultExport)) {
    context.addIssue({ code: z11.ZodIssueCode.custom, path: ["fields"], message: "C\u1EA7n \xEDt nh\u1EA5t m\u1ED9t c\u1ED9t xu\u1EA5t m\u1EB7c \u0111\u1ECBnh" });
  }
  if (!configuration.metrics.some((metric) => metric.isActive)) {
    context.addIssue({ code: z11.ZodIssueCode.custom, path: ["metrics"], message: "C\u1EA7n \xEDt nh\u1EA5t m\u1ED9t ch\u1EC9 s\u1ED1 \u0111ang b\u1EADt" });
  }
  const duplicateFieldLabel = firstDuplicateLabel(configuration.fields.filter((field) => field.isActive).map((field) => field.label));
  if (duplicateFieldLabel) {
    context.addIssue({ code: z11.ZodIssueCode.custom, path: ["fields"], message: `T\xEAn hi\u1EC3n th\u1ECB \u201C${duplicateFieldLabel}\u201D b\u1ECB tr\xF9ng; m\u1ED7i tr\u01B0\u1EDDng c\u1EA7n m\u1ED9t t\xEAn ri\xEAng \u0111\u1EC3 xu\u1EA5t Excel.` });
  }
  const duplicateMetricLabel = firstDuplicateLabel(configuration.metrics.filter((metric) => metric.isActive).map((metric) => metric.label));
  if (duplicateMetricLabel) {
    context.addIssue({ code: z11.ZodIssueCode.custom, path: ["metrics"], message: `T\xEAn hi\u1EC3n th\u1ECB \u201C${duplicateMetricLabel}\u201D b\u1ECB tr\xF9ng; m\u1ED7i ch\u1EC9 s\u1ED1 c\u1EA7n m\u1ED9t t\xEAn ri\xEAng \u0111\u1EC3 xu\u1EA5t Excel.` });
  }
});
var ReportRuleValueSchema = z11.union([z11.string().max(500), z11.number().finite(), z11.boolean()]);
var ReportFilterRuleSchema = z11.object({
  key: ReportFieldKeySchema,
  operator: ReportOperatorKeySchema,
  value: ReportRuleValueSchema.optional(),
  values: z11.array(ReportRuleValueSchema).min(1).max(100).optional(),
  from: z11.union([z11.string().max(50), z11.number().finite()]).optional(),
  to: z11.union([z11.string().max(50), z11.number().finite()]).optional()
}).superRefine((rule, context) => {
  const field = REPORT_FIELD_CATALOG.find((item) => item.key === rule.key);
  if (!field.operators.includes(rule.operator)) {
    context.addIssue({ code: z11.ZodIssueCode.custom, path: ["operator"], message: `To\xE1n t\u1EED ${rule.operator} kh\xF4ng d\xF9ng \u0111\u01B0\u1EE3c cho ${rule.key}` });
    return;
  }
  const operator = REPORT_OPERATOR_CATALOG.find((item) => item.key === rule.operator);
  if (operator.requires === "VALUE" && (rule.value === void 0 || rule.value === "")) {
    context.addIssue({ code: z11.ZodIssueCode.custom, path: ["value"], message: "B\u1ED9 l\u1ECDc c\u1EA7n m\u1ED9t gi\xE1 tr\u1ECB" });
  }
  if (operator.requires === "VALUES" && !rule.values?.length) {
    context.addIssue({ code: z11.ZodIssueCode.custom, path: ["values"], message: "B\u1ED9 l\u1ECDc c\u1EA7n danh s\xE1ch gi\xE1 tr\u1ECB" });
  }
  if (operator.requires === "RANGE" && (rule.from === void 0 || rule.to === void 0)) {
    context.addIssue({ code: z11.ZodIssueCode.custom, path: ["from"], message: "B\u1ED9 l\u1ECDc c\u1EA7n \u0111\u1EE7 gi\xE1 tr\u1ECB t\u1EEB v\xE0 \u0111\u1EBFn" });
  }
  const supplied = [rule.value, ...rule.values || [], rule.from, rule.to].filter((value) => value !== void 0);
  if (field.valueType === "NUMBER" && supplied.some((value) => typeof value !== "number")) {
    context.addIssue({ code: z11.ZodIssueCode.custom, path: ["value"], message: "Key ki\u1EC3u NUMBER ch\u1EC9 nh\u1EADn gi\xE1 tr\u1ECB s\u1ED1" });
  }
  if (field.valueType === "DATE" && supplied.some((value) => typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))) {
    context.addIssue({ code: z11.ZodIssueCode.custom, path: ["value"], message: "Key ki\u1EC3u DATE ch\u1EC9 nh\u1EADn YYYY-MM-DD" });
  }
  if (rule.operator === "op.between" && rule.from !== void 0 && rule.to !== void 0 && rule.from > rule.to) {
    context.addIssue({ code: z11.ZodIssueCode.custom, path: ["to"], message: "Gi\xE1 tr\u1ECB \u0111\u1EBFn ph\u1EA3i l\u1EDBn h\u01A1n ho\u1EB7c b\u1EB1ng gi\xE1 tr\u1ECB t\u1EEB" });
  }
});
var ReportRunRequestSchema = z11.object({
  rules: z11.array(ReportFilterRuleSchema).max(20).default([]),
  match: z11.enum(["ALL", "ANY"]).default("ALL"),
  groupBy: ReportFieldKeySchema.default("dimension.branch"),
  metrics: z11.array(ReportMetricKeySchema).min(1).max(REPORT_METRIC_KEYS.length).default([
    "metric.customer_count",
    "metric.finding_count",
    "metric.exposure_sum"
  ]),
  sort: z11.object({ key: ReportMetricKeySchema, direction: z11.enum(["asc", "desc"]).default("desc") }).optional(),
  limit: z11.number().int().min(1).max(100).default(25)
}).superRefine((query, context) => {
  const groupField = REPORT_FIELD_CATALOG.find((item) => item.key === query.groupBy);
  if (!groupField.groupable) {
    context.addIssue({ code: z11.ZodIssueCode.custom, path: ["groupBy"], message: `${query.groupBy} kh\xF4ng ph\u1EA3i key ph\xE2n nh\xF3m` });
  }
  if (new Set(query.metrics).size !== query.metrics.length) {
    context.addIssue({ code: z11.ZodIssueCode.custom, path: ["metrics"], message: "Key ch\u1EC9 s\u1ED1 kh\xF4ng \u0111\u01B0\u1EE3c l\u1EB7p" });
  }
});
var ReportExportRequestSchema = z11.object({
  query: ReportRunRequestSchema,
  columns: z11.array(ReportFieldKeySchema).min(1).max(REPORT_FIELD_KEYS.length),
  format: z11.enum(["csv", "html", "xlsx"]).default("csv")
}).superRefine((request, context) => {
  request.columns.forEach((key, index) => {
    if (!REPORT_FIELD_CATALOG.find((item) => item.key === key)?.exportable) {
      context.addIssue({ code: z11.ZodIssueCode.custom, path: ["columns", index], message: `${key} kh\xF4ng th\u1EC3 xu\u1EA5t d\u1EEF li\u1EC7u` });
    }
  });
  if (new Set(request.columns).size !== request.columns.length) {
    context.addIssue({ code: z11.ZodIssueCode.custom, path: ["columns"], message: "Key c\u1ED9t xu\u1EA5t kh\xF4ng \u0111\u01B0\u1EE3c l\u1EB7p" });
  }
});
var CreateReportDefinitionSchema = z11.object({
  name: z11.string().trim().min(3).max(150),
  description: z11.string().trim().max(500).optional(),
  filters: ReportFilterSchema.default({}),
  columns: z11.array(ReportColumnSchema).max(15).default([]),
  query: ReportRunRequestSchema.optional(),
  exportColumns: z11.array(ReportFieldKeySchema).max(REPORT_FIELD_KEYS.length).default([])
}).superRefine((definition, context) => {
  if (definition.columns.length === 0 && definition.exportColumns.length === 0) {
    context.addIssue({ code: z11.ZodIssueCode.custom, path: ["exportColumns"], message: "Ph\u1EA3i ch\u1ECDn \xEDt nh\u1EA5t m\u1ED9t c\u1ED9t xu\u1EA5t b\xE1o c\xE1o" });
  }
});

// shared/contracts/campaigns.ts
import { z as z12 } from "zod";
var CampaignMemberSchema = z12.object({
  userId: z12.string().trim().min(1),
  memberRole: z12.enum(["LEAD", "MEMBER"]),
  assignedBranchCodes: z12.array(z12.string().trim().min(1)).default([])
});
var CampaignInputSchema = z12.object({
  code: z12.string().trim().min(2).max(80),
  name: z12.string().trim().min(3).max(255),
  description: z12.string().trim().max(1e3).optional(),
  decisionNo: z12.string().trim().min(2).max(150),
  startDate: z12.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z12.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leadUserId: z12.string().trim().min(1),
  members: z12.array(CampaignMemberSchema).min(1),
  branchCodes: z12.array(z12.string().trim().min(1)).min(1),
  reportChannelIds: z12.array(z12.string().trim().min(1)).min(1)
});
function validateCampaignInput(value, context) {
  if (value.endDate < value.startDate) context.addIssue({ code: z12.ZodIssueCode.custom, path: ["endDate"], message: "Ng\xE0y k\u1EBFt th\xFAc ph\u1EA3i t\u1EEB ng\xE0y b\u1EAFt \u0111\u1EA7u tr\u1EDF \u0111i." });
  const userIds = value.members.map((member) => member.userId);
  if (new Set(userIds).size !== userIds.length) context.addIssue({ code: z12.ZodIssueCode.custom, path: ["members"], message: "Th\xE0nh vi\xEAn kh\xF4ng \u0111\u01B0\u1EE3c tr\xF9ng." });
  const lead = value.members.find((member) => member.userId === value.leadUserId && member.memberRole === "LEAD");
  if (!lead) context.addIssue({ code: z12.ZodIssueCode.custom, path: ["leadUserId"], message: "Tr\u01B0\u1EDFng \u0111o\xE0n ph\u1EA3i c\xF3 trong danh s\xE1ch v\u1EDBi vai tr\xF2 LEAD." });
  const branches = new Set(value.branchCodes);
  if (value.members.some((member) => member.assignedBranchCodes.some((code) => !branches.has(code)))) context.addIssue({ code: z12.ZodIssueCode.custom, path: ["members"], message: "Chi nh\xE1nh ph\xE2n c\xF4ng ph\u1EA3i thu\u1ED9c ph\u1EA1m vi chuy\xEAn \u0111\u1EC1." });
}
var CreateAuditCampaignSchema = CampaignInputSchema.superRefine(validateCampaignInput);
var UpdateAuditCampaignSchema = CampaignInputSchema.partial().extend({
  expectedVersion: z12.number().int().positive(),
  status: z12.enum(["DRAFT", "ACTIVE", "CLOSED", "ARCHIVED"]).optional()
});

// server/src/modules/workflow/workflow-service.ts
var WorkflowCommandService = class {
  assertSelectedApprover(finding, user, field, label) {
    const selectedUserId = finding.approvalRoute?.[field];
    if (selectedUserId && selectedUserId !== user.id) {
      throw new Error(`403: APPROVER_NOT_ASSIGNED \u2014 H\u1ED3 s\u01A1 n\xE0y \u0111\u01B0\u1EE3c ph\xE2n cho ${label} kh\xE1c duy\u1EC7t.`);
    }
  }
  validateTransition(finding, command, user) {
    if (finding.workflowStatus === "WAIVED_RESOLVED") {
      throw new Error("409: FINDING_IS_TERMINAL \u2014 H\u1ED3 s\u01A1 \u0111\xE3 \u0111\u01B0\u1EE3c b\u1ECF l\u1ED7i v\u0129nh vi\u1EC5n, kh\xF4ng th\u1EC3 ch\u1EC9nh s\u1EEDa.");
    }
    switch (command) {
      case "SUBMIT_BRANCH": {
        if (finding.workflowStatus !== "PENDING" && finding.workflowStatus !== "REJECTED") {
          throw new Error(`409: INVALID_TRANSITION \u2014 Kh\xF4ng th\u1EC3 n\u1ED9p duy\u1EC7t t\u1EEB tr\u1EA1ng th\xE1i ${finding.workflowStatus}`);
        }
        if (!user.roles.includes("BRANCH_INPUT")) {
          throw new Error("403: FORBIDDEN \u2014 Ch\u1EC9 C\xE1n b\u1ED9 Chi nh\xE1nh m\u1EDBi \u0111\u01B0\u1EE3c th\u1EF1c hi\u1EC7n n\u1ED9p h\u1ED3 s\u01A1.");
        }
        break;
      }
      case "BRANCH_CONTROL_APPROVE": {
        if (finding.workflowStatus !== "SUBMITTED_BRANCH") {
          throw new Error(`409: INVALID_TRANSITION \u2014 H\u1ED3 s\u01A1 ph\u1EA3i \u1EDF tr\u1EA1ng th\xE1i CH\u1EDC KI\u1EC2M SO\xC1T CHI NH\xC1NH (hi\u1EC7n t\u1EA1i: ${finding.workflowStatus})`);
        }
        if (!user.roles.includes("BRANCH_CONTROLLER")) {
          throw new Error("403: FORBIDDEN \u2014 Ch\u1EC9 Ki\u1EC3m so\xE1t chi nh\xE1nh m\u1EDBi c\xF3 quy\u1EC1n \u0111\u1ED3ng \xFD x\u1EED l\xFD l\u1ED7i.");
        }
        this.assertSelectedApprover(finding, user, "branchControllerUserId", "ng\u01B0\u1EDDi ki\u1EC3m so\xE1t chi nh\xE1nh");
        break;
      }
      case "BRANCH_CONTROL_REJECT": {
        if (finding.workflowStatus !== "SUBMITTED_BRANCH") {
          throw new Error(`409: INVALID_TRANSITION \u2014 H\u1ED3 s\u01A1 ph\u1EA3i \u1EDF tr\u1EA1ng th\xE1i CH\u1EDC KI\u1EC2M SO\xC1T CHI NH\xC1NH (hi\u1EC7n t\u1EA1i: ${finding.workflowStatus})`);
        }
        if (!user.roles.includes("BRANCH_CONTROLLER")) {
          throw new Error("403: FORBIDDEN \u2014 Ch\u1EC9 Ki\u1EC3m so\xE1t chi nh\xE1nh m\u1EDBi c\xF3 quy\u1EC1n chuy\u1EC3n tr\u1EA3 h\u1ED3 s\u01A1.");
        }
        this.assertSelectedApprover(finding, user, "branchControllerUserId", "ng\u01B0\u1EDDi ki\u1EC3m so\xE1t chi nh\xE1nh");
        break;
      }
      case "BRANCH_LEADER_APPROVE": {
        if (finding.workflowStatus !== "SUBMITTED_BRANCH_LEADER") {
          throw new Error(`409: INVALID_TRANSITION \u2014 H\u1ED3 s\u01A1 ph\u1EA3i \u1EDF tr\u1EA1ng th\xE1i CH\u1EDC L\xC3NH \u0110\u1EA0O CHI NH\xC1NH (hi\u1EC7n t\u1EA1i: ${finding.workflowStatus})`);
        }
        if (!user.roles.includes("BRANCH_LEADER")) {
          throw new Error("403: FORBIDDEN \u2014 Ch\u1EC9 L\xE3nh \u0111\u1EA1o chi nh\xE1nh m\u1EDBi c\xF3 quy\u1EC1n ph\xEA duy\u1EC7t b\u01B0\u1EDBc n\xE0y.");
        }
        this.assertSelectedApprover(finding, user, "branchLeaderUserId", "l\xE3nh \u0111\u1EA1o chi nh\xE1nh");
        break;
      }
      case "BRANCH_LEADER_REJECT": {
        if (finding.workflowStatus !== "SUBMITTED_BRANCH_LEADER") {
          throw new Error(`409: INVALID_TRANSITION \u2014 H\u1ED3 s\u01A1 ph\u1EA3i \u1EDF tr\u1EA1ng th\xE1i CH\u1EDC L\xC3NH \u0110\u1EA0O CHI NH\xC1NH (hi\u1EC7n t\u1EA1i: ${finding.workflowStatus})`);
        }
        if (!user.roles.includes("BRANCH_LEADER")) {
          throw new Error("403: FORBIDDEN \u2014 Ch\u1EC9 L\xE3nh \u0111\u1EA1o chi nh\xE1nh m\u1EDBi c\xF3 quy\u1EC1n chuy\u1EC3n tr\u1EA3 h\u1ED3 s\u01A1.");
        }
        this.assertSelectedApprover(finding, user, "branchLeaderUserId", "l\xE3nh \u0111\u1EA1o chi nh\xE1nh");
        break;
      }
      case "INTERNAL_WAIVE": {
        if (finding.workflowStatus !== "SUBMITTED_INTERNAL") {
          throw new Error(`409: INVALID_TRANSITION \u2014 H\u1ED3 s\u01A1 ph\u1EA3i \u0111\u01B0\u1EE3c Ki\u1EC3m so\xE1t chi nh\xE1nh chuy\u1EC3n l\xEAn Kh\u1ED1i N\u1ED9i B\u1ED9 tr\u01B0\u1EDBc khi b\u1ECF l\u1ED7i (hi\u1EC7n t\u1EA1i: ${finding.workflowStatus})`);
        }
        if (!user.roles.includes("INTERNAL_APPROVER") && !user.roles.includes("SUPERVISOR")) {
          throw new Error("403: FORBIDDEN \u2014 Ch\u1EC9 Kh\u1ED1i N\u1ED9i B\u1ED9 / L\xE3nh \u0111\u1EA1o m\u1EDBi c\xF3 quy\u1EC1n ph\xEA duy\u1EC7t b\u1ECF l\u1ED7i.");
        }
        this.assertSelectedApprover(finding, user, "internalApproverUserId", "ng\u01B0\u1EDDi duy\u1EC7t n\u1ED9i b\u1ED9");
        break;
      }
      case "INTERNAL_REJECT": {
        if (finding.workflowStatus !== "SUBMITTED_INTERNAL") {
          throw new Error(`409: INVALID_TRANSITION \u2014 H\u1ED3 s\u01A1 ph\u1EA3i \u1EDF tr\u1EA1ng th\xE1i CH\u1EDC N\u1ED8I B\u1ED8 DUY\u1EC6T (hi\u1EC7n t\u1EA1i: ${finding.workflowStatus})`);
        }
        if (!user.roles.includes("INTERNAL_APPROVER") && !user.roles.includes("SUPERVISOR")) {
          throw new Error("403: FORBIDDEN \u2014 Ch\u1EC9 Kh\u1ED1i N\u1ED9i B\u1ED9 m\u1EDBi c\xF3 quy\u1EC1n t\u1EEB ch\u1ED1i b\u1ECF l\u1ED7i.");
        }
        this.assertSelectedApprover(finding, user, "internalApproverUserId", "ng\u01B0\u1EDDi duy\u1EC7t n\u1ED9i b\u1ED9");
        break;
      }
      default:
        throw new Error(`400: UNKNOWN_COMMAND \u2014 L\u1EC7nh kh\xF4ng h\u1EE3p l\u1EC7: ${command}`);
    }
  }
  executeSubmitBranch(finding, dto, user, workflowType = "TWO_TIER") {
    this.validateTransition(finding, "SUBMIT_BRANCH", user);
    if (dto.expectedVersion !== finding.version) {
      throw new Error(`409: VERSION_CONFLICT \u2014 H\u1ED3 s\u01A1 \u0111\xE3 b\u1ECB c\u1EADp nh\u1EADt b\u1EDFi ng\u01B0\u1EDDi kh\xE1c (version hi\u1EC7n t\u1EA1i: ${finding.version}, expected: ${dto.expectedVersion})`);
    }
    const updated = {
      ...finding,
      workflowStatus: workflowType === "ONE_TIER" ? "SUBMITTED_INTERNAL" : "SUBMITTED_BRANCH",
      resolutionNotes: dto.resolutionNotes,
      version: finding.version + 1,
      rejectedFromStage: void 0,
      rejectionReason: void 0,
      rejectedByUserName: void 0,
      rejectedAt: void 0,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    return updated;
  }
  executeBranchControlApprove(finding, dto, user) {
    this.validateTransition(finding, "BRANCH_CONTROL_APPROVE", user);
    if (dto.expectedVersion !== finding.version) {
      throw new Error(`409: VERSION_CONFLICT \u2014 Version conflict (${finding.version} != ${dto.expectedVersion})`);
    }
    const routeThroughBranchLeader = Boolean(
      finding.approvalRoute?.requiresBranchLeaderApproval || finding.isSpecialCase
    );
    const updated = {
      ...finding,
      workflowStatus: routeThroughBranchLeader ? "SUBMITTED_BRANCH_LEADER" : "SUBMITTED_INTERNAL",
      version: finding.version + 1,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    return updated;
  }
  executeBranchControlReject(finding, dto, user) {
    this.validateTransition(finding, "BRANCH_CONTROL_REJECT", user);
    if (dto.expectedVersion !== finding.version) {
      throw new Error(`409: VERSION_CONFLICT \u2014 Version conflict (${finding.version} != ${dto.expectedVersion})`);
    }
    const updated = {
      ...finding,
      workflowStatus: "REJECTED",
      rejectedFromStage: "BRANCH_CONTROL_REVIEW",
      rejectionReason: dto.reason,
      rejectedByUserName: user.fullName,
      rejectedAt: (/* @__PURE__ */ new Date()).toISOString(),
      version: finding.version + 1,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    return updated;
  }
  executeBranchLeaderApprove(finding, dto, user) {
    this.validateTransition(finding, "BRANCH_LEADER_APPROVE", user);
    if (dto.expectedVersion !== finding.version) {
      throw new Error(`409: VERSION_CONFLICT \u2014 Version conflict (${finding.version} != ${dto.expectedVersion})`);
    }
    return {
      ...finding,
      workflowStatus: "SUBMITTED_INTERNAL",
      version: finding.version + 1,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  executeBranchLeaderReject(finding, dto, user) {
    this.validateTransition(finding, "BRANCH_LEADER_REJECT", user);
    if (dto.expectedVersion !== finding.version) {
      throw new Error(`409: VERSION_CONFLICT \u2014 Version conflict (${finding.version} != ${dto.expectedVersion})`);
    }
    return {
      ...finding,
      workflowStatus: "REJECTED",
      rejectedFromStage: "BRANCH_LEADER_REVIEW",
      rejectionReason: dto.reason,
      rejectedByUserName: user.fullName,
      rejectedAt: (/* @__PURE__ */ new Date()).toISOString(),
      version: finding.version + 1,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  executeInternalWaive(finding, dto, user) {
    this.validateTransition(finding, "INTERNAL_WAIVE", user);
    if (dto.expectedVersion !== finding.version) {
      throw new Error(`409: VERSION_CONFLICT \u2014 Version conflict (${finding.version} != ${dto.expectedVersion})`);
    }
    const updated = {
      ...finding,
      workflowStatus: "WAIVED_RESOLVED",
      slaStatus: "CLOSED",
      version: finding.version + 1,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    return updated;
  }
  executeInternalReject(finding, dto, user) {
    this.validateTransition(finding, "INTERNAL_REJECT", user);
    if (dto.expectedVersion !== finding.version) {
      throw new Error(`409: VERSION_CONFLICT \u2014 Version conflict (${finding.version} != ${dto.expectedVersion})`);
    }
    const updated = {
      ...finding,
      workflowStatus: "REJECTED",
      rejectedFromStage: "INTERNAL_REVIEW",
      rejectionReason: dto.reason,
      rejectedByUserName: user.fullName,
      rejectedAt: (/* @__PURE__ */ new Date()).toISOString(),
      version: finding.version + 1,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    return updated;
  }
};
var workflowService = new WorkflowCommandService();

// server/src/adapters/google-drive.ts
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Readable } from "node:stream";
import { JWT, OAuth2Client } from "google-auth-library";

// server/src/http/problem.ts
import { ZodError } from "zod";

// server/src/state/three-way-state-merge.ts
import { isDeepStrictEqual } from "node:util";
var missing = Symbol("missing");
var StateMergeConflictError = class extends Error {
  constructor(conflictPath) {
    super(`STATE_MERGE_CONFLICT \u2014 D\u1EEF li\u1EC7u \u0111\xE3 \u0111\u01B0\u1EE3c thay \u0111\u1ED5i \u0111\u1ED3ng th\u1EDDi t\u1EA1i ${conflictPath}. H\xE3y t\u1EA3i l\u1EA1i v\xE0 th\u1EED l\u1EA1i.`);
    this.conflictPath = conflictPath;
    this.name = "StateMergeConflictError";
  }
  code = "STATE_MERGE_CONFLICT";
};
function equal(left, right) {
  if (left === missing || right === missing) return left === right;
  return isDeepStrictEqual(left, right);
}
function clone(value) {
  return value === missing ? value : structuredClone(value);
}
function isPlainObject(value) {
  return value !== missing && value !== null && typeof value === "object" && !Array.isArray(value);
}
function entityKey(value) {
  if (!isPlainObject(value)) return void 0;
  if (typeof value.id === "string") return `id:${value.id}`;
  if (typeof value.userId === "string" && typeof value.findingId === "string") {
    return `user-finding:${value.userId}:${value.findingId}`;
  }
  if (typeof value.userId === "string" && typeof value.targetKey === "string") {
    return `user-target:${value.userId}:${value.targetKey}`;
  }
  if (typeof value.userId === "string") return `user:${value.userId}`;
  if (typeof value.code === "string") return `code:${value.code}`;
  if (typeof value.key === "string") return `key:${value.key}`;
  return void 0;
}
function keyedArray(values) {
  const result = /* @__PURE__ */ new Map();
  for (const value of values) {
    const key = entityKey(value);
    if (!key || result.has(key)) return void 0;
    result.set(key, value);
  }
  return result;
}
function mergeArrays(base, local, remote, path5) {
  const baseByKey = keyedArray(base);
  const localByKey = keyedArray(local);
  const remoteByKey = keyedArray(remote);
  if (!baseByKey || !localByKey || !remoteByKey) throw new StateMergeConflictError(path5);
  const orderedKeys = [
    ...remoteByKey.keys(),
    ...[...localByKey.keys()].filter((key) => !remoteByKey.has(key))
  ];
  const merged = [];
  for (const key of orderedKeys) {
    const value = mergeValue(
      baseByKey.get(key) ?? missing,
      localByKey.get(key) ?? missing,
      remoteByKey.get(key) ?? missing,
      `${path5}[${key.replace(/^[^:]+:/, "")}]`
    );
    if (value !== missing) merged.push(value);
  }
  return merged;
}
function mergeObjects(base, local, remote, path5) {
  const result = {};
  const keys = /* @__PURE__ */ new Set([...Object.keys(base), ...Object.keys(remote), ...Object.keys(local)]);
  for (const key of keys) {
    const merged = mergeValue(
      Object.prototype.hasOwnProperty.call(base, key) ? base[key] : missing,
      Object.prototype.hasOwnProperty.call(local, key) ? local[key] : missing,
      Object.prototype.hasOwnProperty.call(remote, key) ? remote[key] : missing,
      path5 ? `${path5}.${key}` : key
    );
    if (merged !== missing) result[key] = merged;
  }
  return result;
}
function mergeValue(base, local, remote, path5) {
  if (equal(local, base)) return clone(remote);
  if (equal(remote, base)) return clone(local);
  if (equal(local, remote)) return clone(local);
  if (base === missing || local === missing || remote === missing) {
    throw new StateMergeConflictError(path5);
  }
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    return mergeArrays(base, local, remote, path5);
  }
  if (isPlainObject(base) && isPlainObject(local) && isPlainObject(remote)) {
    return mergeObjects(base, local, remote, path5);
  }
  throw new StateMergeConflictError(path5);
}
function jsonSnapshot(value) {
  const serialized = JSON.stringify(value);
  if (serialized === void 0) {
    throw new TypeError("State snapshot must be JSON-serializable.");
  }
  return JSON.parse(serialized);
}
function threeWayMergeState(base, local, remote) {
  return mergeValue(jsonSnapshot(base), jsonSnapshot(local), jsonSnapshot(remote), "");
}

// server/src/http/problem.ts
var HttpProblem = class extends Error {
  constructor(status, code, title, detail, invalidParams) {
    super(detail);
    this.status = status;
    this.code = code;
    this.title = title;
    this.invalidParams = invalidParams;
    this.name = "HttpProblem";
  }
};
var titleByCode = {
  FINDING_IS_TERMINAL: "H\u1ED3 s\u01A1 \u0111\xE3 \u0111\xF3ng",
  FORBIDDEN: "Kh\xF4ng \u0111\u1EE7 quy\u1EC1n th\u1EF1c hi\u1EC7n",
  INVALID_TRANSITION: "Chuy\u1EC3n tr\u1EA1ng th\xE1i kh\xF4ng h\u1EE3p l\u1EC7",
  VERSION_CONFLICT: "Xung \u0111\u1ED9t phi\xEAn b\u1EA3n h\u1ED3 s\u01A1",
  UNKNOWN_COMMAND: "L\u1EC7nh workflow kh\xF4ng h\u1EE3p l\u1EC7"
};
function workflowErrorToProblem(error) {
  if (error instanceof HttpProblem) return error;
  const message = error instanceof Error ? error.message : String(error);
  const match = /^(\d{3}):\s*([A-Z0-9_]+)\s*—\s*(.+)$/s.exec(message);
  if (!match) {
    return new HttpProblem(500, "INTERNAL_ERROR", "L\u1ED7i x\u1EED l\xFD workflow", "Kh\xF4ng th\u1EC3 ho\xE0n t\u1EA5t l\u1EC7nh workflow.");
  }
  const status = Number(match[1]);
  const code = match[2];
  return new HttpProblem(status, code, titleByCode[code] ?? "L\u1ED7i workflow", match[3]);
}
function normalizeProblem(error) {
  if (error instanceof HttpProblem) return error;
  if (error instanceof StateMergeConflictError) {
    return new HttpProblem(
      409,
      error.code,
      "Xung \u0111\u1ED9t c\u1EADp nh\u1EADt \u0111\u1ED3ng th\u1EDDi",
      "D\u1EEF li\u1EC7u v\u1EEBa \u0111\u01B0\u1EE3c thay \u0111\u1ED5i \u1EDF m\u1ED9t phi\xEAn kh\xE1c. H\xE3y t\u1EA3i l\u1EA1i d\u1EEF li\u1EC7u m\u1EDBi nh\u1EA5t r\u1ED3i th\u1EED l\u1EA1i.",
      [{ name: error.conflictPath, reason: "Tr\u01B0\u1EDDng n\xE0y \u0111\xE3 thay \u0111\u1ED5i sau snapshot c\u1EE7a y\xEAu c\u1EA7u." }]
    );
  }
  if (error instanceof ZodError) {
    return new HttpProblem(
      422,
      "VALIDATION_ERROR",
      "D\u1EEF li\u1EC7u kh\xF4ng h\u1EE3p l\u1EC7",
      "Y\xEAu c\u1EA7u ch\u1EE9a d\u1EEF li\u1EC7u thi\u1EBFu ho\u1EB7c sai \u0111\u1ECBnh d\u1EA1ng.",
      error.issues.map((issue) => ({
        name: issue.path.join(".") || "body",
        reason: issue.message
      }))
    );
  }
  const statusCode = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : NaN;
  if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 500) {
    return new HttpProblem(
      statusCode,
      "INVALID_REQUEST_BODY",
      "Y\xEAu c\u1EA7u kh\xF4ng h\u1EE3p l\u1EC7",
      "N\u1ED9i dung ho\u1EB7c \u0111\u1ECBnh d\u1EA1ng y\xEAu c\u1EA7u kh\xF4ng h\u1EE3p l\u1EC7."
    );
  }
  return new HttpProblem(500, "INTERNAL_ERROR", "L\u1ED7i m\xE1y ch\u1EE7", "\u0110\xE3 x\u1EA3y ra l\u1ED7i ngo\xE0i d\u1EF1 ki\u1EBFn.");
}
function problemType(code) {
  return `https://audit-bgs.local/problems/${code.toLowerCase().replaceAll("_", "-")}`;
}
function sendProblem(reply, problem, request) {
  return reply.status(problem.status).type("application/problem+json").send({
    type: problemType(problem.code),
    title: problem.title,
    status: problem.status,
    detail: problem.message,
    instance: request?.url,
    code: problem.code,
    ...problem.invalidParams ? { invalidParams: problem.invalidParams } : {}
  });
}

// server/src/adapters/google-drive.ts
if (process.env.NODE_ENV !== "test") dotenv.config();
var DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
var DRIVE_API = "https://www.googleapis.com/drive/v3";
var DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
var FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
function createLocalPreviewPdf() {
  const pageStream = (page) => {
    const content = `BT /F1 18 Tf 72 720 Td (AUDIT BGS - Local evidence preview - Page ${page} of 3) Tj ET`;
    return `<< /Length ${Buffer.byteLength(content, "ascii")} >>
stream
${content}
endstream`;
  };
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R 6 0 R 8 0 R] /Count 3 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", pageStream(1), "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>", pageStream(2), "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 9 0 R >>", pageStream(3)];
  let document = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(document, "ascii"));
    document += `${index + 1} 0 obj
${body}
endobj
`;
  });
  const xrefOffset = Buffer.byteLength(document, "ascii");
  document += `xref
0 ${objects.length + 1}
0000000000 65535 f 
${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n 
`).join("")}trailer
<< /Size ${objects.length + 1} /Root 1 0 R >>
startxref
${xrefOffset}
%%EOF
`;
  return Buffer.from(document, "ascii");
}
function parseServiceAccount(raw) {
  if (!raw) return null;
  try {
    const decoded = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    if (!parsed.client_email || !parsed.private_key) return null;
    return { client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}
function escapeDriveQuery(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
var GoogleDriveAdapter = class {
  localFallbackDir;
  storageMode;
  googleDriveRootFolderId;
  googleDriveAuthMode;
  serviceAccount;
  googleOAuthClientId;
  googleOAuthClientSecret;
  googleOAuthRedirectUri;
  googleOAuthRefreshToken;
  accessTokenProvider;
  fetchImpl;
  constructor(options = {}) {
    this.storageMode = options.storageMode ?? process.env.EVIDENCE_STORAGE_MODE ?? "local";
    this.googleDriveRootFolderId = options.googleDriveRootFolderId ?? process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    this.googleDriveAuthMode = options.googleDriveAuthMode ?? (process.env.GOOGLE_DRIVE_AUTH_MODE === "oauth-user" ? "oauth-user" : "service-account");
    this.serviceAccount = parseServiceAccount(options.googleServiceAccountKey ?? process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    this.googleOAuthClientId = options.googleOAuthClientId ?? process.env.GOOGLE_OAUTH_CLIENT_ID;
    this.googleOAuthClientSecret = options.googleOAuthClientSecret ?? process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    this.googleOAuthRedirectUri = options.googleOAuthRedirectUri ?? process.env.GOOGLE_OAUTH_REDIRECT_URI;
    this.googleOAuthRefreshToken = options.googleOAuthRefreshToken ?? process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
    this.accessTokenProvider = options.accessTokenProvider;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.localFallbackDir = path.resolve(options.localEvidenceDir ?? process.env.LOCAL_EVIDENCE_DIR ?? path.join(process.cwd(), "data", "drive_storage"));
    if (this.storageMode === "local" && !fs.existsSync(this.localFallbackDir)) fs.mkdirSync(this.localFallbackDir, { recursive: true });
  }
  async getStorageStatus() {
    if (this.storageMode === "local") return { mode: "local", durable: true, ready: true };
    if (this.storageMode !== "google-drive") return { mode: "misconfigured", durable: false, ready: false, warning: `EVIDENCE_STORAGE_MODE=${this.storageMode} kh\xF4ng h\u1EE3p l\u1EC7; h\u1EC7 th\u1ED1ng kh\xF4ng fallback local.` };
    if (!this.googleDriveRootFolderId) return this.googleNotReady("Thi\u1EBFu c\u1EA5u h\xECnh GOOGLE_DRIVE_ROOT_FOLDER_ID; h\u1EC7 th\u1ED1ng kh\xF4ng fallback local.");
    if (!this.hasCredential()) return this.googleNotReady(this.credentialWarning());
    try {
      await this.requireGoogleRootFolder();
      return { mode: "google-drive", durable: true, ready: true };
    } catch (error) {
      return this.googleNotReady(error instanceof HttpProblem ? error.message : "Kh\xF4ng th\u1EC3 x\xE1c minh Google Drive API v3.");
    }
  }
  validateUploadMetadata(fileName, mimeType, fileSize) {
    const allowedByExtension = { ".pdf": ["application/pdf"], ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], ".jpg": ["image/jpeg"], ".jpeg": ["image/jpeg"], ".png": ["image/png"] };
    const dangerousSegments = /* @__PURE__ */ new Set(["exe", "com", "bat", "cmd", "ps1", "js", "mjs", "vbs", "scr", "msi", "jar"]);
    const baseName = path.basename(fileName.replaceAll("\\", "/"));
    if (!baseName || baseName !== fileName) throw new HttpProblem(415, "UNSAFE_FILE_NAME", "T\xEAn t\u1EC7p kh\xF4ng an to\xE0n", "T\xEAn t\u1EC7p kh\xF4ng \u0111\u01B0\u1EE3c ch\u1EE9a \u0111\u01B0\u1EDDng d\u1EABn.");
    if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > 25 * 1024 * 1024) throw new HttpProblem(413, "EVIDENCE_SIZE_INVALID", "K\xEDch th\u01B0\u1EDBc t\u1EC7p kh\xF4ng h\u1EE3p l\u1EC7", "Minh ch\u1EE9ng ph\u1EA3i l\u1EDBn h\u01A1n 0 byte v\xE0 kh\xF4ng v\u01B0\u1EE3t qu\xE1 25 MB.");
    if (!allowedByExtension[path.extname(baseName).toLowerCase()]?.includes(mimeType.toLowerCase())) throw new HttpProblem(415, "EVIDENCE_TYPE_NOT_ALLOWED", "Lo\u1EA1i t\u1EC7p kh\xF4ng \u0111\u01B0\u1EE3c h\u1ED7 tr\u1EE3", "Ch\u1EC9 ch\u1EA5p nh\u1EADn PDF, DOCX, XLSX, JPG v\xE0 PNG \u0111\xFAng MIME type.");
    if (baseName.toLowerCase().split(".").slice(0, -1).some((segment) => dangerousSegments.has(segment))) throw new HttpProblem(415, "DOUBLE_EXTENSION_REJECTED", "T\u1EC7p c\xF3 ph\u1EA7n m\u1EDF r\u1ED9ng k\xE9p nguy hi\u1EC3m", "T\xEAn t\u1EC7p ch\u1EE9a ph\u1EA7n m\u1EDF r\u1ED9ng th\u1EF1c thi \u1EA9n.");
    const sanitized = baseName.normalize("NFC").replace(/[^\p{L}\p{N}._ -]/gu, "_").replace(/\s+/g, " ").trim();
    if (!sanitized) throw new HttpProblem(415, "UNSAFE_FILE_NAME", "T\xEAn t\u1EC7p kh\xF4ng an to\xE0n", "T\xEAn t\u1EC7p kh\xF4ng c\xF2n k\xFD t\u1EF1 h\u1EE3p l\u1EC7 sau khi chu\u1EA9n h\xF3a.");
    return sanitized;
  }
  createOAuthAuthorizationUrl(state) {
    if (!state) throw new HttpProblem(422, "GOOGLE_OAUTH_STATE_INVALID", "OAuth state kh\xF4ng h\u1EE3p l\u1EC7", "Kh\xF4ng th\u1EC3 b\u1EAFt \u0111\u1EA7u k\u1EBFt n\u1ED1i Google Drive do thi\u1EBFu OAuth state.");
    const client = this.requireOAuthClient();
    return client.generateAuthUrl({
      access_type: "offline",
      include_granted_scopes: true,
      prompt: "consent",
      scope: [DRIVE_SCOPE],
      state
    });
  }
  async exchangeOAuthCode(code) {
    if (!code) throw new HttpProblem(422, "GOOGLE_OAUTH_CODE_INVALID", "OAuth code kh\xF4ng h\u1EE3p l\u1EC7", "Google kh\xF4ng g\u1EEDi authorization code.");
    const client = this.requireOAuthClient();
    try {
      const { tokens } = await client.getToken(code);
      if (!tokens.refresh_token) throw new HttpProblem(409, "GOOGLE_OAUTH_REFRESH_TOKEN_MISSING", "Google ch\u01B0a c\u1EA5p refresh token", "H\xE3y thu h\u1ED3i quy\u1EC1n \u1EE9ng d\u1EE5ng r\u1ED3i k\u1EBFt n\u1ED1i l\u1EA1i \u0111\u1EC3 Google hi\u1EC3n th\u1ECB m\xE0n h\xECnh ch\u1EA5p thu\u1EADn.");
      this.googleOAuthRefreshToken = tokens.refresh_token;
      return tokens.refresh_token;
    } catch (error) {
      if (error instanceof HttpProblem) throw error;
      throw new HttpProblem(503, "GOOGLE_OAUTH_EXCHANGE_FAILED", "Kh\xF4ng th\u1EC3 ho\xE0n t\u1EA5t k\u1EBFt n\u1ED1i Google Drive", "Google t\u1EEB ch\u1ED1i ho\u1EB7c kh\xF4ng th\u1EC3 \u0111\u1ED5i authorization code.");
    }
  }
  setOAuthRefreshToken(refreshToken) {
    this.googleOAuthRefreshToken = refreshToken?.trim() || void 0;
  }
  generateFolderPath(params) {
    const sanitize = (value) => value.normalize("NFC").replace(/[^a-zA-Z0-9_\u00C0-\u1EF9-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    const campaign = sanitize(params.campaignCode ?? "KHONG_CHUYEN_DE");
    return `/${campaign}/${sanitize(params.channelCode)}/${params.year}/${sanitize(params.clusterName)}/CN_${sanitize(params.branchCode)}/KHACH_HANG/${sanitize(params.cif)}_${sanitize(params.customerName ?? "KHACH_HANG")}/LOI_${sanitize(params.errorCode)}`;
  }
  async createResumableUploadSession(params) {
    this.requireGoogleMode();
    const fileName = this.validateUploadMetadata(params.fileName, params.mimeType, params.fileSize);
    this.requireChecksum(params.sha256Checksum);
    const parentId = await this.ensureGoogleFolderPath(params.folderPath);
    const driveFileId = await this.generateDriveFileId();
    const response = await this.driveFetch(`${DRIVE_UPLOAD_API}/files?uploadType=resumable&supportsAllDrives=true`, { method: "POST", headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": params.mimeType, "X-Upload-Content-Length": String(params.fileSize) }, body: JSON.stringify({ id: driveFileId, name: fileName, mimeType: params.mimeType, parents: [parentId], appProperties: { auditBgsFindingId: params.findingId, auditBgsSha256: params.sha256Checksum } }) });
    const uploadUrl = response.headers.get("location");
    if (!uploadUrl) throw new HttpProblem(503, "GOOGLE_DRIVE_UPLOAD_SESSION_FAILED", "Kh\xF4ng t\u1EA1o \u0111\u01B0\u1EE3c phi\xEAn t\u1EA3i Google Drive", "Google Drive kh\xF4ng tr\u1EA3 v\u1EC1 URL t\u1EA3i l\xEAn c\xF3 th\u1EC3 ti\u1EBFp t\u1EE5c.");
    return { uploadMode: "google-drive", uploadUrl, driveFileId, fileName, mimeType: params.mimeType, fileSize: params.fileSize, sha256Checksum: params.sha256Checksum };
  }
  async completeResumableUpload(params) {
    this.requireGoogleMode();
    const fileName = this.validateUploadMetadata(params.fileName, params.mimeType, params.fileSize);
    this.requireChecksum(params.sha256Checksum);
    const expectedParentId = await this.ensureGoogleFolderPath(params.folderPath);
    const metadata = await this.driveFetchJson(`${DRIVE_API}/files/${encodeURIComponent(params.driveFileId)}?fields=id,name,mimeType,size,parents,trashed,appProperties&supportsAllDrives=true`);
    if (metadata.id !== params.driveFileId || metadata.name !== fileName || metadata.mimeType !== params.mimeType || Number(metadata.size) !== params.fileSize || metadata.trashed || !metadata.parents?.includes(expectedParentId) || metadata.appProperties?.auditBgsFindingId !== params.findingId || metadata.appProperties?.auditBgsSha256 !== params.sha256Checksum) throw new HttpProblem(409, "GOOGLE_DRIVE_UPLOAD_VERIFICATION_FAILED", "Kh\xF4ng x\xE1c minh \u0111\u01B0\u1EE3c t\u1EC7p Google Drive", "Metadata t\u1EC7p t\u1EA3i l\xEAn kh\xF4ng kh\u1EDBp v\u1EDBi phi\xEAn minh ch\u1EE9ng \u0111\xE3 y\xEAu c\u1EA7u.");
    return { driveFileId: metadata.id, driveUrl: `/api/v1/evidence/${metadata.id}/content`, sha256Checksum: params.sha256Checksum, fileSize: params.fileSize, mimeType: params.mimeType, folderPath: params.folderPath };
  }
  async uploadEvidenceFile(params) {
    if (this.storageMode === "google-drive") {
      if (!this.googleDriveRootFolderId || !this.accessTokenProvider && !this.serviceAccount) this.requireGoogleMode();
      throw new HttpProblem(503, "GOOGLE_DRIVE_DIRECT_UPLOAD_REQUIRED", "C\u1EA7n t\u1EA3i tr\u1EF1c ti\u1EBFp l\xEAn Google Drive", "D\xF9ng API upload-session \u0111\u1EC3 tr\xECnh duy\u1EC7t t\u1EA3i t\u1EC7p tr\u1EF1c ti\u1EBFp l\xEAn Google Drive.");
    }
    if (this.storageMode !== "local") throw this.invalidModeProblem();
    const fileSize = params.fileBuffer.length;
    const safeFileName = this.validateUploadMetadata(params.fileName, params.mimeType, fileSize);
    const sha256Checksum = crypto.createHash("sha256").update(params.fileBuffer).digest("hex");
    const fileId = `drive_${crypto.randomUUID()}`;
    const targetFolder = path.resolve(this.localFallbackDir, params.folderPath.replace(/^[/\\]+/, ""));
    if (targetFolder !== this.localFallbackDir && !targetFolder.startsWith(`${this.localFallbackDir}${path.sep}`)) throw new HttpProblem(400, "UNSAFE_STORAGE_PATH", "\u0110\u01B0\u1EDDng d\u1EABn l\u01B0u tr\u1EEF kh\xF4ng h\u1EE3p l\u1EC7", "\u0110\u01B0\u1EDDng d\u1EABn th\u01B0 m\u1EE5c minh ch\u1EE9ng v\u01B0\u1EE3t ngo\xE0i th\u01B0 m\u1EE5c local cho ph\xE9p.");
    if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });
    fs.writeFileSync(path.join(targetFolder, `${fileId}_${safeFileName}`), params.fileBuffer);
    return { driveFileId: fileId, driveUrl: `/api/v1/evidence/${fileId}/content`, sha256Checksum, fileSize, mimeType: params.mimeType, folderPath: params.folderPath };
  }
  async getFileContentStream(driveFileId) {
    if (this.storageMode === "google-drive") {
      this.requireGoogleMode();
      const metadata = await this.driveFetchJson(`${DRIVE_API}/files/${encodeURIComponent(driveFileId)}?fields=id,name,mimeType&supportsAllDrives=true`);
      const response = await this.driveFetch(`${DRIVE_API}/files/${encodeURIComponent(driveFileId)}?alt=media&supportsAllDrives=true`);
      if (!response.body) throw new HttpProblem(503, "GOOGLE_DRIVE_CONTENT_UNAVAILABLE", "Kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c n\u1ED9i dung Google Drive", "Google Drive kh\xF4ng tr\u1EA3 v\u1EC1 lu\u1ED3ng n\u1ED9i dung t\u1EC7p.");
      return { stream: Readable.fromWeb(response.body), fileName: metadata.name, mimeType: metadata.mimeType };
    }
    if (this.storageMode !== "local") throw this.invalidModeProblem();
    if (driveFileId === "drive_mock_001" || driveFileId === "drive_mock_002") return { stream: Readable.from(createLocalPreviewPdf()), fileName: `${driveFileId}_local-preview.pdf`, mimeType: "application/pdf" };
    const matchingFile = fs.readdirSync(this.localFallbackDir, { recursive: true }).find((file) => path.basename(file).startsWith(`${driveFileId}_`));
    if (!matchingFile) return null;
    const mimeTypes = { ".pdf": "application/pdf", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };
    return { stream: fs.createReadStream(path.join(this.localFallbackDir, matchingFile)), fileName: path.basename(matchingFile).replace(`${driveFileId}_`, ""), mimeType: mimeTypes[path.extname(matchingFile).toLowerCase()] ?? "application/octet-stream" };
  }
  googleNotReady(warning) {
    return { mode: "google-drive", durable: false, ready: false, warning };
  }
  invalidModeProblem() {
    return new HttpProblem(503, "EVIDENCE_STORAGE_MODE_INVALID", "Ch\u1EBF \u0111\u1ED9 l\u01B0u minh ch\u1EE9ng kh\xF4ng h\u1EE3p l\u1EC7", `EVIDENCE_STORAGE_MODE=${this.storageMode} kh\xF4ng \u0111\u01B0\u1EE3c h\u1ED7 tr\u1EE3; h\u1EC7 th\u1ED1ng kh\xF4ng fallback local.`);
  }
  requireChecksum(value) {
    if (!/^[a-f0-9]{64}$/i.test(value)) throw new HttpProblem(422, "EVIDENCE_CHECKSUM_INVALID", "Checksum kh\xF4ng h\u1EE3p l\u1EC7", "SHA-256 c\u1EE7a t\u1EC7p ph\u1EA3i c\xF3 \u0111\xFAng 64 k\xFD t\u1EF1 hexadecimal.");
  }
  hasCredential() {
    return Boolean(this.accessTokenProvider) || (this.googleDriveAuthMode === "oauth-user" ? Boolean(this.googleOAuthClientId && this.googleOAuthClientSecret && this.googleOAuthRedirectUri && this.googleOAuthRefreshToken) : Boolean(this.serviceAccount));
  }
  credentialWarning() {
    if (this.googleDriveAuthMode === "oauth-user") {
      if (!this.googleOAuthClientId || !this.googleOAuthClientSecret || !this.googleOAuthRedirectUri) {
        return "Thi\u1EBFu GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET ho\u1EB7c GOOGLE_OAUTH_REDIRECT_URI; h\u1EC7 th\u1ED1ng kh\xF4ng fallback local.";
      }
      return "Ch\u01B0a k\u1EBFt n\u1ED1i Google Drive c\xE1 nh\xE2n. Qu\u1EA3n tr\u1ECB vi\xEAn h\xE3y m\u1EDF /api/v1/integrations/google-drive/connect sau khi \u0111\u0103ng nh\u1EADp; h\u1EC7 th\u1ED1ng kh\xF4ng fallback local.";
    }
    return "Thi\u1EBFu ho\u1EB7c kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh credential GOOGLE_SERVICE_ACCOUNT_JSON; h\u1EC7 th\u1ED1ng kh\xF4ng fallback local.";
  }
  requireGoogleMode() {
    if (this.storageMode !== "google-drive") throw this.invalidModeProblem();
    if (!this.googleDriveRootFolderId || !this.hasCredential()) throw new HttpProblem(503, "GOOGLE_DRIVE_ADAPTER_NOT_READY", "Google Drive ch\u01B0a s\u1EB5n s\xE0ng", `${this.credentialWarning()} GOOGLE_DRIVE_ROOT_FOLDER_ID l\xE0 b\u1EAFt bu\u1ED9c.`);
  }
  requireOAuthClient() {
    if (this.googleDriveAuthMode !== "oauth-user" || !this.googleOAuthClientId || !this.googleOAuthClientSecret || !this.googleOAuthRedirectUri) {
      throw new HttpProblem(503, "GOOGLE_OAUTH_NOT_CONFIGURED", "OAuth Google Drive ch\u01B0a \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh", "C\u1EA7n GOOGLE_DRIVE_AUTH_MODE=oauth-user c\xF9ng GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET v\xE0 GOOGLE_OAUTH_REDIRECT_URI.");
    }
    return new OAuth2Client(this.googleOAuthClientId, this.googleOAuthClientSecret, this.googleOAuthRedirectUri);
  }
  async getAccessToken() {
    if (this.accessTokenProvider) return this.accessTokenProvider();
    if (this.googleDriveAuthMode === "oauth-user") {
      if (!this.googleOAuthRefreshToken) throw new HttpProblem(503, "GOOGLE_DRIVE_ADAPTER_NOT_READY", "Google Drive ch\u01B0a s\u1EB5n s\xE0ng", "Ch\u01B0a c\xF3 refresh token OAuth cho Google Drive.");
      const client2 = this.requireOAuthClient();
      client2.setCredentials({ refresh_token: this.googleOAuthRefreshToken });
      const token2 = await client2.getAccessToken();
      if (!token2.token) throw new HttpProblem(503, "GOOGLE_DRIVE_AUTH_FAILED", "Kh\xF4ng x\xE1c th\u1EF1c \u0111\u01B0\u1EE3c Google Drive", "Google kh\xF4ng tr\u1EA3 access token cho t\xE0i kho\u1EA3n OAuth.");
      return token2.token;
    }
    if (!this.serviceAccount) throw new HttpProblem(503, "GOOGLE_DRIVE_ADAPTER_NOT_READY", "Google Drive ch\u01B0a s\u1EB5n s\xE0ng", "Kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c GOOGLE_SERVICE_ACCOUNT_JSON.");
    const client = new JWT({ email: this.serviceAccount.client_email, key: this.serviceAccount.private_key, scopes: [DRIVE_SCOPE] });
    const token = await client.getAccessToken();
    if (!token.token) throw new HttpProblem(503, "GOOGLE_DRIVE_AUTH_FAILED", "Kh\xF4ng x\xE1c th\u1EF1c \u0111\u01B0\u1EE3c Google Drive", "Google kh\xF4ng tr\u1EA3 access token cho service account.");
    return token.token;
  }
  async driveFetch(url, init = {}) {
    let response;
    try {
      response = await this.fetchImpl(url, { ...init, headers: { Authorization: `Bearer ${await this.getAccessToken()}`, ...init.headers } });
    } catch {
      throw new HttpProblem(503, "GOOGLE_DRIVE_UNAVAILABLE", "Google Drive kh\xF4ng kh\u1EA3 d\u1EE5ng", "Kh\xF4ng k\u1EBFt n\u1ED1i \u0111\u01B0\u1EE3c Google Drive API v3.");
    }
    if (!response.ok) throw new HttpProblem(503, "GOOGLE_DRIVE_UNAVAILABLE", "Google Drive kh\xF4ng kh\u1EA3 d\u1EE5ng", `Google Drive API v3 tr\u1EA3 HTTP ${response.status}.`);
    return response;
  }
  async driveFetchJson(url, init) {
    return (await this.driveFetch(url, init)).json();
  }
  async requireGoogleRootFolder() {
    this.requireGoogleMode();
    const folder = await this.driveFetchJson(`${DRIVE_API}/files/${encodeURIComponent(this.googleDriveRootFolderId)}?fields=id,driveId,mimeType,trashed,capabilities(canAddChildren)&supportsAllDrives=true`);
    if (folder.id !== this.googleDriveRootFolderId || folder.mimeType !== FOLDER_MIME_TYPE || folder.trashed || folder.capabilities?.canAddChildren === false) throw new HttpProblem(503, "GOOGLE_DRIVE_ROOT_UNAVAILABLE", "Th\u01B0 m\u1EE5c Google Drive ch\u01B0a s\u1EB5n s\xE0ng", "Credential hi\u1EC7n t\u1EA1i kh\xF4ng c\xF3 quy\u1EC1n th\xEAm t\u1EC7p v\xE0o th\u01B0 m\u1EE5c g\u1ED1c \u0111\xE3 c\u1EA5u h\xECnh.");
    if (this.googleDriveAuthMode === "service-account" && !folder.driveId) throw new HttpProblem(503, "GOOGLE_DRIVE_SHARED_DRIVE_REQUIRED", "C\u1EA7n d\xF9ng Shared Drive cho Google Drive", "Service account kh\xF4ng c\xF3 storage quota trong My Drive; h\xE3y \u0111\u1EB7t th\u01B0 m\u1EE5c g\u1ED1c trong Shared Drive v\xE0 c\u1EA5p quy\u1EC1n Contributor ho\u1EB7c Content manager.");
  }
  async ensureGoogleFolderPath(folderPath) {
    await this.requireGoogleRootFolder();
    let parentId = this.googleDriveRootFolderId;
    for (const folderName of folderPath.split("/").filter(Boolean)) {
      const query = `name = '${escapeDriveQuery(folderName)}' and '${escapeDriveQuery(parentId)}' in parents and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`;
      const search = await this.driveFetchJson(`${DRIVE_API}/files?${new URLSearchParams({ q: query, fields: "files(id)", supportsAllDrives: "true", includeItemsFromAllDrives: "true" })}`);
      if (search.files?.[0]?.id) {
        parentId = search.files[0].id;
        continue;
      }
      const created = await this.driveFetchJson(`${DRIVE_API}/files?supportsAllDrives=true`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: folderName, mimeType: FOLDER_MIME_TYPE, parents: [parentId] }) });
      parentId = created.id;
    }
    return parentId;
  }
  async generateDriveFileId() {
    const result = await this.driveFetchJson(`${DRIVE_API}/files/generateIds?count=1&space=drive`);
    const id = result.ids?.[0];
    if (!id) throw new HttpProblem(503, "GOOGLE_DRIVE_ID_ALLOCATION_FAILED", "Kh\xF4ng t\u1EA1o \u0111\u01B0\u1EE3c ID t\u1EC7p Google Drive", "Google Drive kh\xF4ng tr\u1EA3 file ID cho phi\xEAn t\u1EA3i l\xEAn.");
    return id;
  }
};
var googleDriveService = new GoogleDriveAdapter();

// server/src/adapters/apps-script-drive.ts
import crypto2 from "node:crypto";
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).filter(([, nested]) => nested !== void 0).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, stableValue(nested)])
    );
  }
  return value;
}
function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}
function signDriveRequest(request, secret) {
  const canonicalPayload = canonicalJson(request.payload);
  const message = `${request.timestamp}.${request.nonce}.${request.action}.${canonicalPayload}`;
  return {
    ...request,
    signature: crypto2.createHmac("sha256", secret).update(message, "utf8").digest("hex")
  };
}
var AppsScriptDriveGateway = class {
  endpointUrl;
  secret;
  fetchImpl;
  now;
  nonce;
  timeoutMs;
  constructor(options = {}) {
    this.endpointUrl = options.endpointUrl ?? process.env.GOOGLE_APPS_SCRIPT_URL ?? "";
    this.secret = options.secret ?? process.env.GOOGLE_APPS_SCRIPT_SECRET ?? "";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.nonce = options.nonce ?? crypto2.randomUUID;
    this.timeoutMs = options.timeoutMs ?? 15e3;
  }
  isConfigured() {
    return Boolean(this.endpointUrl && this.secret);
  }
  async execute(action, payload) {
    if (!this.isConfigured()) {
      throw new HttpProblem(
        503,
        "DRIVE_NOT_CONFIGURED",
        "Google Drive ch\u01B0a \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh",
        "Qu\u1EA3n tr\u1ECB vi\xEAn c\u1EA7n khai b\xE1o URL Apps Script v\xE0 kh\xF3a b\xED m\u1EADt tr\u01B0\u1EDBc khi t\u1EA1o kho d\u1EEF li\u1EC7u."
      );
    }
    const request = signDriveRequest({
      action,
      payload,
      timestamp: this.now(),
      nonce: this.nonce()
    }, this.secret);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.endpointUrl, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(request),
        redirect: "follow",
        signal: controller.signal
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok || !result.data) {
        throw new HttpProblem(
          502,
          result?.error?.code ?? "DRIVE_GATEWAY_FAILED",
          "Kh\xF4ng th\u1EC3 c\u1EADp nh\u1EADt Google Drive",
          result?.error?.message ?? "Apps Script kh\xF4ng tr\u1EA3 v\u1EC1 k\u1EBFt qu\u1EA3 h\u1EE3p l\u1EC7."
        );
      }
      return result;
    } catch (error) {
      if (error instanceof HttpProblem) throw error;
      const timedOut = error instanceof Error && error.name === "AbortError";
      throw new HttpProblem(
        503,
        timedOut ? "DRIVE_GATEWAY_TIMEOUT" : "DRIVE_GATEWAY_UNAVAILABLE",
        "Google Drive t\u1EA1m th\u1EDDi kh\xF4ng kh\u1EA3 d\u1EE5ng",
        timedOut ? "Apps Script kh\xF4ng ph\u1EA3n h\u1ED3i trong th\u1EDDi gian cho ph\xE9p." : "Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i t\u1EDBi Apps Script."
      );
    } finally {
      clearTimeout(timer);
    }
  }
};
var appsScriptDriveGateway = new AppsScriptDriveGateway();

// server/src/adapters/postgres.ts
import { Pool } from "pg";
import dotenv2 from "dotenv";
dotenv2.config();
var databaseUrl = process.env.DATABASE_URL;
function assertDatabaseConfigured() {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL_REQUIRED \u2014 H\xE3y khai b\xE1o database AuditBGS r\xF5 r\xE0ng tr\u01B0\u1EDBc khi migrate/seed.");
  }
}
var pool = new Pool({
  connectionString: databaseUrl,
  max: 20,
  idleTimeoutMillis: 3e4,
  connectionTimeoutMillis: 5e3
});

// server/src/repositories/local-state.ts
import fs2 from "node:fs";
import path2 from "node:path";
import { randomUUID } from "node:crypto";
var LOCK_RETRY_ATTEMPTS = 21;
var LOCK_RETRY_DELAY_MS = 10;
var MALFORMED_LOCK_GRACE_MS = 1e3;
var LocalStateRepository = class {
  filePath;
  enabled;
  status;
  activeLockToken;
  recoverableSelfLockTokens = /* @__PURE__ */ new Set();
  constructor(options) {
    this.filePath = path2.resolve(options.filePath);
    this.enabled = options.enabled;
    this.status = options.status ?? (this.enabled ? { mode: "local-json", durable: true } : { mode: "memory", durable: false });
  }
  getStatus() {
    return this.status;
  }
  readEnvelope(snapshotPath) {
    const envelope = JSON.parse(fs2.readFileSync(snapshotPath, "utf8"));
    if (envelope.schemaVersion !== 1 || envelope.data === void 0) throw new Error("invalid envelope");
    return envelope;
  }
  readSnapshot(snapshotPath) {
    return this.readEnvelope(snapshotPath).data;
  }
  get lockPath() {
    return `${this.filePath}.lock`;
  }
  readLockOwner(lockPath = this.lockPath) {
    try {
      const candidate = JSON.parse(fs2.readFileSync(lockPath, "utf8"));
      return typeof candidate.pid === "number" && Number.isInteger(candidate.pid) && typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt) && typeof candidate.token === "string" && candidate.token.length > 0 ? candidate : void 0;
    } catch {
      return void 0;
    }
  }
  isProcessAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    if (pid === process.pid) return true;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error.code === "EPERM";
    }
  }
  recoverAbandonedLock() {
    if (!fs2.existsSync(this.lockPath)) return true;
    const owner = this.readLockOwner();
    const selfOwnedOrphan = owner?.pid === process.pid && owner.token !== this.activeLockToken && this.recoverableSelfLockTokens.has(owner.token);
    if (owner && this.isProcessAlive(owner.pid) && !selfOwnedOrphan) return false;
    if (!owner) {
      try {
        if (Date.now() - fs2.statSync(this.lockPath).mtimeMs < MALFORMED_LOCK_GRACE_MS) return false;
      } catch {
        return true;
      }
    }
    const quarantinedPath = `${this.lockPath}.abandoned.${process.pid}.${randomUUID()}`;
    try {
      fs2.renameSync(this.lockPath, quarantinedPath);
    } catch (error) {
      if (error.code === "ENOENT") return true;
      return false;
    }
    const movedOwner = this.readLockOwner(quarantinedPath);
    const ownerChangedDuringQuarantine = owner ? movedOwner?.token !== owner.token : movedOwner !== void 0;
    if (ownerChangedDuringQuarantine) {
      this.restoreQuarantinedPath(quarantinedPath, this.lockPath);
      return false;
    }
    try {
      fs2.rmSync(quarantinedPath, { force: true });
    } catch {
      return false;
    }
    if (owner?.token) this.recoverableSelfLockTokens.delete(owner.token);
    return true;
  }
  restoreQuarantinedPath(quarantinedPath, targetPath) {
    if (fs2.existsSync(targetPath)) return;
    try {
      fs2.renameSync(quarantinedPath, targetPath);
    } catch {
    }
  }
  waitBeforeRetry() {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_RETRY_DELAY_MS);
  }
  transientLockError(error) {
    const code = error.code;
    return code === "EPERM" || code === "EACCES" || code === "EBUSY";
  }
  releaseLock(owner) {
    let lastError;
    for (let attempt = 0; attempt < LOCK_RETRY_ATTEMPTS; attempt++) {
      const currentOwner = this.readLockOwner();
      if (currentOwner?.token !== owner.token) return void 0;
      const releasedPath = `${this.lockPath}.released.${owner.pid}.${owner.token}.${randomUUID()}`;
      try {
        fs2.renameSync(this.lockPath, releasedPath);
      } catch (error) {
        if (error.code === "ENOENT") return void 0;
        lastError = error instanceof Error ? error : new Error(String(error));
        if (!this.transientLockError(error) || attempt === LOCK_RETRY_ATTEMPTS - 1) return lastError;
        this.waitBeforeRetry();
        continue;
      }
      const releasedOwner = this.readLockOwner(releasedPath);
      if (releasedOwner?.token !== owner.token) {
        this.restoreQuarantinedPath(releasedPath, this.lockPath);
        return void 0;
      }
      try {
        fs2.rmSync(releasedPath, { force: true });
        return void 0;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.restoreQuarantinedPath(releasedPath, this.lockPath);
        if (!this.transientLockError(error) || attempt === LOCK_RETRY_ATTEMPTS - 1) return lastError;
        this.waitBeforeRetry();
      }
    }
    return lastError;
  }
  acquireExclusiveLock() {
    fs2.mkdirSync(path2.dirname(this.filePath), { recursive: true });
    const owner = { pid: process.pid, createdAt: Date.now(), token: randomUUID() };
    for (let attempt = 0; attempt < LOCK_RETRY_ATTEMPTS; attempt++) {
      let lockHandle;
      try {
        lockHandle = fs2.openSync(this.lockPath, "wx");
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        if (this.recoverAbandonedLock()) continue;
        if (attempt < LOCK_RETRY_ATTEMPTS - 1) this.waitBeforeRetry();
        continue;
      }
      try {
        fs2.writeFileSync(lockHandle, JSON.stringify(owner), "utf8");
      } catch (error) {
        if (lockHandle !== void 0) fs2.closeSync(lockHandle);
        const releaseError = this.releaseLock(owner);
        throw releaseError ?? error;
      }
      fs2.closeSync(lockHandle);
      return owner;
    }
    throw new Error(`LOCAL_STATE_BUSY \u2014 \u0110ang c\xF3 ti\u1EBFn tr\xECnh kh\xE1c c\u1EADp nh\u1EADt ${this.filePath}.`);
  }
  withExclusiveLock(operation) {
    const owner = this.acquireExclusiveLock();
    this.activeLockToken = owner.token;
    let operationError;
    try {
      return operation(owner);
    } catch (error) {
      operationError = error;
      throw error;
    } finally {
      const releaseError = this.releaseLock(owner);
      this.activeLockToken = void 0;
      if (releaseError) {
        this.recoverableSelfLockTokens.add(owner.token);
        console.error(
          operationError === void 0 ? "[LocalStateRepository] Snapshot \u0111\xE3 ghi th\xE0nh c\xF4ng nh\u01B0ng ch\u01B0a d\u1ECDn \u0111\u01B0\u1EE3c lock; l\u1EA7n thao t\xE1c sau s\u1EBD t\u1EF1 ph\u1EE5c h\u1ED3i." : "[LocalStateRepository] Kh\xF4ng d\u1ECDn \u0111\u01B0\u1EE3c lock sau khi thao t\xE1c th\u1EA5t b\u1EA1i.",
          releaseError
        );
      } else {
        this.recoverableSelfLockTokens.delete(owner.token);
      }
    }
  }
  temporarySnapshotPaths() {
    const directory = path2.dirname(this.filePath);
    const prefix = `${path2.basename(this.filePath)}.tmp`;
    try {
      return fs2.readdirSync(directory).filter((name) => name === prefix || name.startsWith(`${prefix}.`)).map((name) => path2.join(directory, name));
    } catch {
      return [];
    }
  }
  removeTemporarySnapshots(temporaryPaths) {
    for (const temporaryPath of temporaryPaths) fs2.rmSync(temporaryPath, { force: true });
  }
  temporarySnapshotCandidates(temporaryPaths) {
    return temporaryPaths.flatMap((temporaryPath) => {
      try {
        const envelope = this.readEnvelope(temporaryPath);
        const savedAt = Date.parse(envelope.savedAt);
        return Number.isFinite(savedAt) ? [{ temporaryPath, savedAt, data: envelope.data }] : [];
      } catch {
        return [];
      }
    }).sort((left, right) => right.savedAt - left.savedAt);
  }
  replaceTemporarySnapshot(temporaryPath, owner) {
    try {
      fs2.renameSync(temporaryPath, this.filePath);
      return;
    } catch (firstError) {
      const code = firstError.code;
      if (code !== "EEXIST" && code !== "EPERM") throw firstError;
    }
    const backupPath = `${this.filePath}.backup.${owner.pid}.${owner.token}`;
    let mainBackedUp = false;
    if (fs2.existsSync(this.filePath)) {
      fs2.renameSync(this.filePath, backupPath);
      mainBackedUp = true;
    }
    try {
      fs2.renameSync(temporaryPath, this.filePath);
    } catch (secondError) {
      if (mainBackedUp && !fs2.existsSync(this.filePath)) this.restoreQuarantinedPath(backupPath, this.filePath);
      throw secondError;
    }
    if (mainBackedUp) {
      try {
        fs2.rmSync(backupPath, { force: true });
      } catch {
      }
    }
  }
  recoverNewestTemporarySnapshot(temporaryPaths, owner) {
    const candidates = this.temporarySnapshotCandidates(temporaryPaths);
    const newest = candidates[0];
    if (!newest) return void 0;
    this.replaceTemporarySnapshot(newest.temporaryPath, owner);
    this.removeTemporarySnapshots(temporaryPaths.filter((temporaryPath) => temporaryPath !== newest.temporaryPath));
    return newest.data;
  }
  loadUnlocked(fallback, owner) {
    const temporaryPaths = this.temporarySnapshotPaths();
    const mainExists = fs2.existsSync(this.filePath);
    if (!mainExists) {
      const recovered = this.recoverNewestTemporarySnapshot(temporaryPaths, owner);
      if (recovered !== void 0) return recovered;
      if (!temporaryPaths.length) return structuredClone(fallback);
      throw new Error(`LOCAL_STATE_CORRUPTED \u2014 Kh\xF4ng th\u1EC3 ph\u1EE5c h\u1ED3i ${this.filePath} t\u1EEB snapshot t\u1EA1m.`);
    }
    try {
      const mainEnvelope = this.readEnvelope(this.filePath);
      const newestTemporary = this.temporarySnapshotCandidates(temporaryPaths)[0];
      const mainSavedAt = Date.parse(mainEnvelope.savedAt);
      if (newestTemporary && (!Number.isFinite(mainSavedAt) || newestTemporary.savedAt > mainSavedAt)) {
        this.replaceTemporarySnapshot(newestTemporary.temporaryPath, owner);
        this.removeTemporarySnapshots(temporaryPaths.filter((temporaryPath) => temporaryPath !== newestTemporary.temporaryPath));
        return newestTemporary.data;
      }
      this.removeTemporarySnapshots(temporaryPaths);
      return mainEnvelope.data;
    } catch (error) {
      const recovered = this.recoverNewestTemporarySnapshot(temporaryPaths, owner);
      if (recovered !== void 0) return recovered;
      this.removeTemporarySnapshots(temporaryPaths);
      throw new Error(`LOCAL_STATE_CORRUPTED \u2014 Kh\xF4ng th\u1EC3 \u0111\u1ECDc ${this.filePath}: ${error instanceof Error ? error.message : "invalid JSON"}`);
    }
  }
  load(fallback) {
    if (!this.enabled) return structuredClone(fallback);
    return this.withExclusiveLock((owner) => this.loadUnlocked(fallback, owner));
  }
  writeSnapshot(data, owner) {
    const temporaryPath = `${this.filePath}.tmp.${owner.pid}.${owner.token}`;
    const envelope = {
      schemaVersion: 1,
      savedAt: (/* @__PURE__ */ new Date()).toISOString(),
      data
    };
    fs2.writeFileSync(temporaryPath, `${JSON.stringify(envelope, null, 2)}
`, { encoding: "utf8", flag: "w" });
    this.replaceTemporarySnapshot(temporaryPath, owner);
  }
  save(data) {
    if (!this.enabled) return;
    this.withExclusiveLock((owner) => this.writeSnapshot(data, owner));
  }
  update(fallback, transform) {
    if (!this.enabled) {
      const latest = structuredClone(fallback);
      return transform(latest) ?? latest;
    }
    return this.withExclusiveLock((owner) => {
      const latest = this.loadUnlocked(fallback, owner);
      const next = transform(latest) ?? latest;
      this.writeSnapshot(next, owner);
      return next;
    });
  }
};
function createLocalStateRepository(options) {
  const dataStoreMode = options.dataStoreMode ?? "local-json";
  if (dataStoreMode !== "local-json" && dataStoreMode !== "memory") {
    throw new Error(`INVALID_DATA_STORE_MODE: DATA_STORE_MODE must be local-json or memory; received ${dataStoreMode}.`);
  }
  const status = dataStoreMode === "local-json" ? { mode: "local-json", durable: true } : { mode: "memory", durable: false };
  return new LocalStateRepository({
    filePath: options.filePath,
    enabled: status.durable && options.persistenceEnabled !== false,
    status
  });
}

// server/src/repositories/postgres-state.ts
var PostgresStateRepository = class {
  pool;
  snapshotId;
  constructor(options) {
    this.pool = options.pool;
    this.snapshotId = options.snapshotId ?? "primary";
  }
  async getStatus() {
    let client;
    try {
      client = await this.pool.connect();
      await client.query("SELECT 1");
      return { mode: "postgres", durable: true, ready: true };
    } catch (error) {
      return {
        mode: "postgres",
        durable: false,
        ready: false,
        warning: `POSTGRES_UNAVAILABLE \u2014 ${error instanceof Error ? error.message : "Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i database."}`
      };
    } finally {
      client?.release();
    }
  }
  async load(fallback) {
    return this.withTransaction(async (client) => {
      const row = await this.loadRow(client);
      return structuredClone(row?.payload ?? fallback);
    });
  }
  async hasSnapshot() {
    return this.withTransaction(async (client) => await this.loadRow(client) !== void 0);
  }
  async save(data) {
    await this.withTransaction(async (client) => {
      await this.acquireWriteLock(client);
      await this.saveRow(client, data);
    });
  }
  async update(fallback, transform) {
    return this.withTransaction(async (client) => {
      await this.acquireWriteLock(client);
      const row = await this.loadRow(client);
      const latest = structuredClone(row?.payload ?? fallback);
      const transformed = await transform(latest);
      const next = transformed ?? latest;
      await this.saveRow(client, next);
      return structuredClone(next);
    });
  }
  async withTransaction(operation) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.runtime_role', 'backend', true)");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
      }
      throw error;
    } finally {
      client.release();
    }
  }
  async acquireWriteLock(client) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('audit_bgs_app_state'))");
  }
  async loadRow(client) {
    const result = await client.query(
      "SELECT payload, version FROM app_state_snapshots WHERE id = $1",
      [this.snapshotId]
    );
    return result.rows[0];
  }
  async saveRow(client, data) {
    await client.query(
      `INSERT INTO app_state_snapshots(id, payload, version, updated_at)
       VALUES ($1, $2::jsonb, 1, NOW())
       ON CONFLICT (id) DO UPDATE SET
         payload = EXCLUDED.payload,
         version = app_state_snapshots.version + 1,
         updated_at = NOW()
       RETURNING version`,
      [this.snapshotId, data]
    );
  }
};

// server/src/repositories/state-repository.ts
function createStateRepository(options) {
  const dataStoreMode = options.dataStoreMode ?? "local-json";
  if (dataStoreMode === "postgres") {
    if (!options.postgresPool) assertDatabaseConfigured();
    return new PostgresStateRepository({
      pool: options.postgresPool ?? pool,
      snapshotId: options.snapshotId
    });
  }
  if (dataStoreMode === "local-json" || dataStoreMode === "memory") {
    return createLocalStateRepository({
      filePath: options.filePath,
      dataStoreMode,
      persistenceEnabled: options.persistenceEnabled
    });
  }
  throw new Error(
    `INVALID_DATA_STORE_MODE: DATA_STORE_MODE must be postgres, local-json or memory; received ${dataStoreMode}.`
  );
}

// server/src/state/durable-state-coordinator.ts
var DurableStateCoordinator = class {
  lastDurableState;
  constructor(hydratedState2) {
    this.lastDurableState = structuredClone(hydratedState2);
  }
  snapshot() {
    return structuredClone(this.lastDurableState);
  }
  hydrate(state) {
    this.lastDurableState = structuredClone(state);
  }
  persist(write, restore) {
    try {
      const savedState = write();
      this.lastDurableState = structuredClone(savedState);
      return savedState;
    } catch (error) {
      restore(structuredClone(this.lastDurableState));
      throw error;
    }
  }
  async persistAsync(write, restore) {
    try {
      const savedState = await write();
      this.lastDurableState = structuredClone(savedState);
      return savedState;
    } catch (error) {
      restore(structuredClone(this.lastDurableState));
      throw error;
    }
  }
};

// server/src/state/runtime-request-lock.ts
var livenessPaths = /* @__PURE__ */ new Set(["/api/v1/health", "/api/v1/ready"]);
var nonHydratedPaths = /* @__PURE__ */ new Set([...livenessPaths, "/api/v1/internal/sla/run"]);
var readMethods = /* @__PURE__ */ new Set(["GET", "HEAD"]);
function shouldHydrateRuntimeStatePerRequest(env, requestPath, method = "GET") {
  if (env.DATA_STORE_MODE !== "postgres") return false;
  if (!readMethods.has(method.toUpperCase())) return false;
  return !nonHydratedPaths.has(requestPath.split("?")[0]);
}
var RuntimeRequestLock = class {
  tail = Promise.resolve();
  async acquire() {
    let releaseTicket;
    const ticket = new Promise((resolve) => {
      releaseTicket = resolve;
    });
    const turn = this.tail;
    this.tail = turn.then(() => ticket);
    await turn;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      releaseTicket();
    };
  }
};

// server/src/worker/sla-worker.ts
import fs3 from "node:fs";
import path3 from "node:path";
var DAY_MS = 24 * 60 * 60 * 1e3;
function calendarDate(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`INVALID_SLA_DATE: ${value}`);
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const result = new Date(year, month - 1, day);
  if (result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day) throw new Error(`INVALID_SLA_DATE: ${value}`);
  return result;
}
function toCalendarDateString(value) {
  const date = calendarDate(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function addCalendarDays(baseDate, days) {
  const result = calendarDate(baseDate);
  result.setDate(result.getDate() + days);
  return toCalendarDateString(result);
}
var SlaEvaluationWorker = class {
  evaluateFindingSla(finding, asOfDate = /* @__PURE__ */ new Date()) {
    if (finding.workflowStatus === "WAIVED_RESOLVED") {
      return { slaStatus: "CLOSED", isOverdue: false, daysRemaining: 0 };
    }
    const deadline = calendarDate(finding.deadlineDate);
    const diffTime = deadline.getTime() - calendarDate(asOfDate).getTime();
    const daysRemaining = Math.round(diffTime / DAY_MS);
    let slaStatus = "ON_TRACK";
    let isOverdue = false;
    if (daysRemaining < 0) {
      slaStatus = "OVERDUE";
      isOverdue = true;
    } else if (daysRemaining <= 3) {
      slaStatus = "DUE_SOON";
      isOverdue = false;
    } else {
      slaStatus = "ON_TRACK";
      isOverdue = false;
    }
    return { slaStatus, isOverdue, daysRemaining };
  }
  runDailyEvaluation(findings2, asOfDate = /* @__PURE__ */ new Date()) {
    let updatedCount = 0;
    let overdueCount = 0;
    let dueSoonCount = 0;
    for (const finding of findings2) {
      const evaluation = this.evaluateFindingSla(finding, asOfDate);
      if (finding.slaStatus !== evaluation.slaStatus || finding.isOverdue !== evaluation.isOverdue) {
        finding.slaStatus = evaluation.slaStatus;
        finding.isOverdue = evaluation.isOverdue;
        updatedCount++;
      }
      if (evaluation.slaStatus === "OVERDUE") overdueCount++;
      if (evaluation.slaStatus === "DUE_SOON") dueSoonCount++;
    }
    console.log(`[SLA Worker 08:30] Evaluated ${findings2.length} findings. Overdue: ${overdueCount}, Due Soon: ${dueSoonCount}, Updated: ${updatedCount}`);
    return { updatedCount, overdueCount, dueSoonCount };
  }
};
var slaWorker = new SlaEvaluationWorker();
function runSlaEvaluation(findings2, asOfDate = /* @__PURE__ */ new Date()) {
  return slaWorker.runDailyEvaluation(findings2, asOfDate);
}
function runStandaloneSlaEvaluation(filePath = process.env.LOCAL_STATE_FILE ?? path3.join(process.cwd(), "data", "local-state.json")) {
  const resolvedPath = path3.resolve(filePath);
  if (!fs3.existsSync(resolvedPath)) {
    console.warn(`[SLA Worker] Kh\xF4ng t\xECm th\u1EA5y local state t\u1EA1i ${resolvedPath}; kh\xF4ng t\u1EA1o state r\u1ED7ng.`);
    return { skipped: true, updatedCount: 0, overdueCount: 0, dueSoonCount: 0 };
  }
  const repository = new LocalStateRepository({ filePath: resolvedPath, enabled: true });
  let result = { updatedCount: 0, overdueCount: 0, dueSoonCount: 0 };
  repository.update({ findings: [] }, (latest) => {
    result = runSlaEvaluation(latest.findings);
  });
  return { skipped: false, ...result };
}
if (process.argv[1] && process.argv[1].includes("sla-worker.ts")) {
  console.log("\u26A1 Starting standalone SLA & Escalation Worker...");
  runStandaloneSlaEvaluation();
}

// server/src/worker/sla-scheduler.ts
var systemTimers = {
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: (handle) => globalThis.clearTimeout(handle)
};
function millisecondsUntilNextSlaRun(now) {
  const nextRun = new Date(now);
  nextRun.setHours(8, 30, 0, 0);
  if (nextRun.getTime() <= now.getTime()) nextRun.setDate(nextRun.getDate() + 1);
  return nextRun.getTime() - now.getTime();
}
function shouldStartEmbeddedSlaRuntime(env = process.env) {
  return env.NODE_ENV !== "test" && env.NODE_ENV !== "production";
}
function startDailySlaRuntime(runEvaluation, options = {}) {
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const timers = options.timers ?? systemTimers;
  const onError = options.onError ?? ((error) => console.error("[SLA Scheduler] Evaluation failed; the next run remains scheduled.", error));
  let timer;
  let stopped = false;
  const schedule = (delay) => {
    timer = timers.setTimeout(() => {
      if (stopped) return;
      executeAndSchedule();
    }, delay);
  };
  const reportError = (error) => {
    try {
      onError(error);
    } catch (reportingError) {
      console.error("[SLA Scheduler] Error reporter failed.", reportingError);
    }
  };
  const scheduleNext = () => {
    if (!stopped) schedule(millisecondsUntilNextSlaRun(now()));
  };
  const executeAndSchedule = () => {
    try {
      const result = runEvaluation();
      if (result && typeof result.then === "function") {
        void Promise.resolve(result).catch(reportError).finally(scheduleNext);
        return;
      }
    } catch (error) {
      reportError(error);
    }
    scheduleNext();
  };
  executeAndSchedule();
  return () => {
    stopped = true;
    if (timer !== void 0) timers.clearTimeout(timer);
  };
}

// server/src/http/content-disposition.ts
var encodeRfc5987Value = (value) => encodeURIComponent(value).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
var asciiFallback = (fileName) => {
  const normalized = fileName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "_").replace(/["\\\r\n]/g, "_").trim();
  return normalized || "evidence";
};
var buildContentDisposition = (mode, fileName) => `${mode}; filename="${asciiFallback(fileName)}"; filename*=UTF-8''${encodeRfc5987Value(fileName.normalize("NFC"))}`;
var buildInlineContentDisposition = (fileName) => buildContentDisposition("inline", fileName);
var buildAttachmentContentDisposition = (fileName) => buildContentDisposition("attachment", fileName);
var INLINE_SAFE_MIME_TYPES = /* @__PURE__ */ new Set(["application/pdf", "image/jpeg", "image/png"]);
var isInlineSafeMimeType = (mimeType) => INLINE_SAFE_MIME_TYPES.has(mimeType.toLowerCase());

// server/src/report-export.ts
import JSZip from "jszip";
var xmlEscape = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
var htmlValue = (value) => {
  if (typeof value === "number") return value.toLocaleString("vi-VN");
  if (typeof value === "boolean") return value ? "C\xF3" : "Kh\xF4ng";
  return String(value ?? "");
};
function renderReportHtml(report) {
  const renderTable = (columns, rows) => `
    <div class="table-wrap">
      <table>
        <thead><tr>${columns.map((column) => `<th>${xmlEscape(column.label)}</th>`).join("")}</tr></thead>
        <tbody>${rows.length > 0 ? rows.map((row) => `<tr>${row.map((value, index) => `<td class="${columns[index]?.kind === "number" ? "number" : ""}">${xmlEscape(htmlValue(value))}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${columns.length}">Kh\xF4ng c\xF3 d\u1EEF li\u1EC7u ph\xF9 h\u1EE3p.</td></tr>`}</tbody>
      </table>
    </div>`;
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>B\xE1o c\xE1o Audit BGS</title>
  <style>
    :root{color-scheme:light;--brand:#006b68;--brand-dark:#00504e;--ink:#172033;--muted:#64748b;--line:#dbe3ea;--soft:#f3f8f7}
    *{box-sizing:border-box}body{margin:0;background:#eef3f3;color:var(--ink);font:14px/1.5 Arial,"Helvetica Neue",sans-serif}
    main{width:min(1180px,calc(100% - 32px));margin:28px auto;background:#fff;border-radius:18px;box-shadow:0 18px 50px rgba(0,80,78,.10);overflow:hidden}
    header{padding:30px 34px;background:var(--brand);color:#fff}header p{margin:6px 0 0;color:#d8f3f1}h1{margin:0;font-size:26px;letter-spacing:-.02em}
    section{padding:24px 34px;border-bottom:1px solid var(--line)}h2{margin:0 0 14px;font-size:17px}h3{margin:22px 0 10px;font-size:14px;color:var(--brand-dark)}
    .meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.tag{border:1px solid rgba(255,255,255,.35);border-radius:8px;padding:5px 9px;font-size:12px}
    .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}.metric{padding:15px;border:1px solid var(--line);border-radius:12px;background:var(--soft)}
    .metric span{display:block;color:var(--muted);font-size:12px}.metric strong{display:block;margin-top:5px;color:var(--brand-dark);font-size:20px;font-variant-numeric:tabular-nums}
    .filters{margin:0;padding-left:20px;color:#475569}.filters li+li{margin-top:5px}.table-wrap{max-width:100%;overflow:auto;border:1px solid var(--line);border-radius:12px}
    table{width:100%;border-collapse:collapse;white-space:nowrap}th{position:sticky;top:0;background:var(--brand);color:#fff;text-align:left;font-size:12px}th,td{padding:10px 12px;border-bottom:1px solid var(--line)}tbody tr:nth-child(even){background:#f8fafc}tbody tr:hover{background:#ecf7f6}.number{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
    footer{padding:16px 34px;color:var(--muted);font-size:11px;background:#f8fafc}
    @media(max-width:640px){main{width:100%;margin:0;border-radius:0}header,section,footer{padding-left:18px;padding-right:18px}.metrics{grid-template-columns:1fr 1fr}}
    @media print{body{background:#fff}main{width:100%;margin:0;box-shadow:none;border-radius:0}.table-wrap{overflow:visible}th{position:static}section{break-inside:avoid}.details{break-inside:auto}}
  </style>
</head>
<body><main>
  <header><h1>B\xE1o c\xE1o Audit BGS</h1><p>B\xE1o c\xE1o t\u1ED5ng h\u1EE3p v\xE0 d\u1EEF li\u1EC7u chi ti\u1EBFt theo ph\u1EA1m vi \u0111\u01B0\u1EE3c c\u1EA5p.</p><div class="meta"><span class="tag">Th\u1EDDi \u0111i\u1EC3m xu\u1EA5t: ${xmlEscape(new Date(report.generatedAt).toLocaleString("vi-VN"))}</span><span class="tag">${report.detailRows.length} d\xF2ng chi ti\u1EBFt</span></div></header>
  <section><h2>T\u1ED5ng quan</h2><div class="metrics">${report.summary.map((item) => `<div class="metric"><span>${xmlEscape(item.label)}</span><strong>${xmlEscape(htmlValue(item.value))}</strong></div>`).join("")}</div>
    <h3>\u0110i\u1EC1u ki\u1EC7n \xE1p d\u1EE5ng</h3><ul class="filters">${(report.filters.length ? report.filters : ["Kh\xF4ng c\xF3 \u0111i\u1EC1u ki\u1EC7n l\u1ECDc"]).map((item) => `<li>${xmlEscape(item)}</li>`).join("")}</ul></section>
  <section><h2>Ph\xE2n t\xEDch theo ${xmlEscape(report.groupLabel)}</h2>${renderTable(report.groupColumns, report.groupRows)}</section>
  <section class="details"><h2>D\u1EEF li\u1EC7u chi ti\u1EBFt</h2>${renderTable(report.detailColumns, report.detailRows)}</section>
  <footer>Audit BGS | T\u1EC7p \u0111\u1ED9c l\u1EADp, c\xF3 th\u1EC3 l\u01B0u tr\u1EEF ho\u1EB7c in tr\u1EF1c ti\u1EBFp.</footer>
</main></body></html>`;
}
var columnName = (index) => {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
};
var xlsxCell = (value, row, column, style) => {
  const ref = `${columnName(column)}${row}`;
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}" s="${style}" t="n"><v>${value}</v></c>`;
  const display = typeof value === "boolean" ? value ? "C\xF3" : "Kh\xF4ng" : value;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(display)}</t></is></c>`;
};
var columnWidths = (columns, rows) => columns.map((column, index) => {
  const widest = Math.max(column.label.length, ...rows.slice(0, 250).map((row) => String(row[index] ?? "").length));
  return `<col min="${index + 1}" max="${index + 1}" width="${Math.min(42, Math.max(12, widest + 2))}" customWidth="1"/>`;
}).join("");
var tableSheet = (columns, sourceRows, tableRelId) => {
  const rows = sourceRows.length > 0 ? sourceRows : [["Kh\xF4ng c\xF3 d\u1EEF li\u1EC7u", ...columns.slice(1).map(() => "")]];
  const headerNames = uniqueColumnNames(columns);
  const header = `<row r="1" ht="26" customHeight="1">${headerNames.map((label, index) => xlsxCell(label, 1, index, 3)).join("")}</row>`;
  const body = rows.map((row, rowIndex) => `<row r="${rowIndex + 2}">${columns.map((column, columnIndex) => xlsxCell(row[columnIndex], rowIndex + 2, columnIndex, column.kind === "number" ? 5 : 4)).join("")}</row>`).join("");
  const end = `${columnName(columns.length - 1)}${rows.length + 1}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${end}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="20"/><cols>${columnWidths(columns, rows)}</cols><sheetData>${header}${body}</sheetData>
  <pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
  <tableParts count="1"><tablePart r:id="${tableRelId}"/></tableParts>
</worksheet>`;
};
var overviewSheet = (report) => {
  const data = [
    { values: ["B\xC1O C\xC1O AUDIT BGS", "", "", ""], style: 1, height: 30 },
    { values: ["Th\u1EDDi \u0111i\u1EC3m xu\u1EA5t", new Date(report.generatedAt).toLocaleString("vi-VN"), "S\u1ED1 d\xF2ng chi ti\u1EBFt", report.detailRows.length], style: 4 },
    { values: ["", "", "", ""], style: 0 },
    { values: ["T\u1ED4NG QUAN", "", "", ""], style: 2, height: 24 },
    ...report.summary.map((item) => ({ values: [item.label, item.value, "", ""], style: 4 })),
    { values: ["", "", "", ""], style: 0 },
    { values: ["\u0110I\u1EC0U KI\u1EC6N \xC1P D\u1EE4NG", "", "", ""], style: 2, height: 24 },
    ...(report.filters.length ? report.filters : ["Kh\xF4ng c\xF3 \u0111i\u1EC1u ki\u1EC7n l\u1ECDc"]).map((filter, index) => ({ values: [`${index + 1}`, filter, "", ""], style: 4 }))
  ];
  const rows = data.map((item, index) => `<row r="${index + 1}"${item.height ? ` ht="${item.height}" customHeight="1"` : ""}>${item.values.map((value, column) => xlsxCell(value, index + 1, column, item.style)).join("")}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:D${data.length}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="2" width="42" customWidth="1"/><col min="3" max="3" width="22" customWidth="1"/><col min="4" max="4" width="20" customWidth="1"/></cols><sheetData>${rows}</sheetData><mergeCells count="3"><mergeCell ref="A1:D1"/><mergeCell ref="A4:D4"/><mergeCell ref="A${report.summary.length + 6}:D${report.summary.length + 6}"/></mergeCells><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
};
var uniqueColumnNames = (columns) => {
  const used = /* @__PURE__ */ new Set();
  return columns.map((column, index) => {
    const base = column.label.trim() || `C\u1ED9t ${index + 1}`;
    let name = base;
    let suffix = 2;
    while (used.has(name.toLocaleLowerCase("vi-VN"))) name = `${base} (${suffix++})`;
    used.add(name.toLocaleLowerCase("vi-VN"));
    return name;
  });
};
var tableXml = (id, name, columns, rowCount) => {
  const end = `${columnName(columns.length - 1)}${Math.max(2, rowCount + 1)}`;
  const names = uniqueColumnNames(columns);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${id}" name="${name}" displayName="${name}" ref="A1:${end}" totalsRowShown="0"><autoFilter ref="A1:${end}"/><tableColumns count="${columns.length}">${names.map((columnLabel, index) => `<tableColumn id="${index + 1}" name="${xmlEscape(columnLabel)}"/>`).join("")}</tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`;
};
async function renderReportXlsx(report) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/><Override PartName="/xl/tables/table2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/></Types>`);
  zip.folder("_rels").file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.folder("xl").file("workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="T\u1ED5ng quan" sheetId="1" r:id="rId1"/><sheet name="Ph\xE2n t\xEDch" sheetId="2" r:id="rId2"/><sheet name="D\u1EEF li\u1EC7u chi ti\u1EBFt" sheetId="3" r:id="rId3"/></sheets><calcPr calcId="191029"/></workbook>`);
  zip.folder("xl").folder("_rels").file("workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.folder("xl").file("styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="16"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF006B68"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8F4F3"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD9E2E8"/></left><right style="thin"><color rgb="FFD9E2E8"/></right><top style="thin"><color rgb="FFD9E2E8"/></top><bottom style="thin"><color rgb="FFD9E2E8"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="1" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`);
  const sheets = zip.folder("xl").folder("worksheets");
  sheets.file("sheet1.xml", overviewSheet(report));
  sheets.file("sheet2.xml", tableSheet(report.groupColumns, report.groupRows, "rId1"));
  sheets.file("sheet3.xml", tableSheet(report.detailColumns, report.detailRows, "rId1"));
  const sheetRels = sheets.folder("_rels");
  sheetRels.file("sheet2.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/></Relationships>`);
  sheetRels.file("sheet3.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table2.xml"/></Relationships>`);
  const tables = zip.folder("xl").folder("tables");
  tables.file("table1.xml", tableXml(1, "PhanTich", report.groupColumns, report.groupRows.length));
  tables.file("table2.xml", tableXml(2, "DuLieuChiTiet", report.detailColumns, report.detailRows.length));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

// server/src/security/access-control.ts
var normalize = (value) => value?.trim().toLocaleLowerCase("vi-VN");
function resolveLocalUser(headerValue, users) {
  const requestedId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!requestedId) {
    throw new HttpProblem(401, "AUTH_REQUIRED", "Ch\u01B0a x\xE1c th\u1EF1c", "Local API y\xEAu c\u1EA7u header x-user-id h\u1EE3p l\u1EC7.");
  }
  const user = users.find((item) => item.id === requestedId || item.username === requestedId);
  if (!user) {
    throw new HttpProblem(401, "INVALID_LOCAL_USER", "T\xE0i kho\u1EA3n local kh\xF4ng h\u1EE3p l\u1EC7", "Kh\xF4ng t\xECm th\u1EA5y t\xE0i kho\u1EA3n t\u01B0\u01A1ng \u1EE9ng v\u1EDBi x-user-id.");
  }
  if (!user.isActive) {
    throw new HttpProblem(403, "USER_DISABLED", "T\xE0i kho\u1EA3n \u0111\xE3 b\u1ECB kh\xF3a", "T\xE0i kho\u1EA3n hi\u1EC7n kh\xF4ng \u0111\u01B0\u1EE3c ph\xE9p truy c\u1EADp.");
  }
  return user;
}
function requireRoles(user, allowedRoles) {
  if (!allowedRoles.some((role) => user.roles.includes(role))) {
    throw new HttpProblem(403, "FORBIDDEN", "Kh\xF4ng \u0111\u1EE7 quy\u1EC1n th\u1EF1c hi\u1EC7n", "Vai tr\xF2 hi\u1EC7n t\u1EA1i kh\xF4ng \u0111\u01B0\u1EE3c ph\xE9p th\u1EF1c hi\u1EC7n thao t\xE1c n\xE0y.");
  }
}
function requireAdmin(user) {
  if (!user.roles.includes("ADMIN")) {
    throw new HttpProblem(403, "ADMIN_REQUIRED", "Kh\xF4ng \u0111\u1EE7 quy\u1EC1n qu\u1EA3n tr\u1ECB", "Ch\u1EC9 qu\u1EA3n tr\u1ECB vi\xEAn \u0111\u01B0\u1EE3c truy c\u1EADp t\xE0i nguy\xEAn n\xE0y.");
  }
}
function hasFindingAccess(user, finding) {
  if (!user.isActive) return false;
  if (user.scopes.some((scope) => scope.scopeType === "ALL")) return true;
  return user.scopes.some((scope) => {
    const scopedBranchCode = scope.orgUnitCode ?? user.branchCode;
    const scopedBranchName = scope.branchName ?? user.branchName;
    const branchMatches = scopedBranchCode ? scopedBranchCode === finding.branchCode : normalize(scopedBranchName) === normalize(finding.branchName);
    switch (scope.scopeType) {
      case "CLUSTER":
        return normalize(scope.clusterName ?? user.clusterName) === normalize(finding.clusterName);
      case "BRANCH":
        return branchMatches;
      case "DEPARTMENT":
        return branchMatches && normalize(scope.departmentName ?? user.department) === normalize(finding.department);
      default:
        return false;
    }
  });
}

// server/src/security/password.ts
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
var scryptAsync = promisify(scrypt);
var KEY_LENGTH = 64;
async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}
async function verifyPassword(password, encoded) {
  const [algorithm, saltValue, keyValue, extra] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltValue || !keyValue || extra !== void 0) return false;
  try {
    const salt = Buffer.from(saltValue, "base64url");
    const expected = Buffer.from(keyValue, "base64url");
    if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false;
    const actual = await scryptAsync(password, salt, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// server/src/security/session-store.ts
import { createHash, randomBytes as randomBytes2 } from "node:crypto";
var AuthSessionStore = class {
  now;
  ttlMs;
  onChange;
  sessionRecords;
  constructor(options = {}) {
    this.now = options.now ?? (() => /* @__PURE__ */ new Date());
    this.ttlMs = options.ttlMs ?? 8 * 60 * 60 * 1e3;
    this.sessionRecords = structuredClone(options.records ?? []);
    this.onChange = options.onChange;
  }
  digest(token) {
    return createHash("sha256").update(token).digest("hex");
  }
  publish() {
    this.onChange?.(this.records());
  }
  create(userId) {
    this.purgeExpired();
    const token = randomBytes2(32).toString("hex");
    const createdAt = this.now();
    const record = {
      id: `session-${randomBytes2(16).toString("hex")}`,
      userId,
      tokenDigest: this.digest(token),
      createdAt: createdAt.toISOString(),
      lastSeenAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + this.ttlMs).toISOString()
    };
    this.sessionRecords.push(record);
    this.publish();
    return { token, record: structuredClone(record) };
  }
  resolve(token) {
    this.purgeExpired();
    if (!token) return void 0;
    const record = this.sessionRecords.find((item) => item.tokenDigest === this.digest(token) && !item.revokedAt);
    if (!record) return void 0;
    record.lastSeenAt = this.now().toISOString();
    return structuredClone(record);
  }
  revoke(token) {
    if (!token) return false;
    const record = this.sessionRecords.find((item) => item.tokenDigest === this.digest(token) && !item.revokedAt);
    if (!record) return false;
    record.revokedAt = this.now().toISOString();
    this.publish();
    return true;
  }
  /**
   * Thu hồi mọi phiên đang mở của một tài khoản. Dùng khi đổi hoặc đặt lại mật khẩu: nếu không,
   * phiên cấp bằng mật khẩu cũ vẫn dùng được và việc đặt lại mật khẩu không có tác dụng bảo vệ.
   */
  revokeAllForUser(userId) {
    const revokedAt = this.now().toISOString();
    let revoked = 0;
    for (const record of this.sessionRecords) {
      if (record.userId !== userId || record.revokedAt) continue;
      record.revokedAt = revokedAt;
      revoked += 1;
    }
    if (revoked > 0) this.publish();
    return revoked;
  }
  purgeExpired() {
    const nowMs = this.now().getTime();
    const before = this.sessionRecords.length;
    this.sessionRecords = this.sessionRecords.filter((item) => !item.revokedAt && Date.parse(item.expiresAt) > nowMs);
    if (this.sessionRecords.length !== before) this.publish();
    return before - this.sessionRecords.length;
  }
  records() {
    return structuredClone(this.sessionRecords);
  }
};

// server/src/security/google-drive-oauth-state.ts
import crypto3 from "node:crypto";
var STATE_TTL_MS = 10 * 60 * 1e3;
function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}
function decodeBase64Url(value) {
  return Buffer.from(value, "base64url");
}
function requireSecret(value, label) {
  if (!value || value.length < 16) throw new Error(`${label} is not configured.`);
}
function secureEqual(left, right) {
  return left.length === right.length && crypto3.timingSafeEqual(left, right);
}
function createGoogleDriveOAuthState({ userId, secret, now = Date.now() }) {
  requireSecret(secret, "Google OAuth state secret");
  if (!userId) throw new Error("Google OAuth state requires a user.");
  const payload = { version: 1, userId, expiresAt: now + STATE_TTL_MS, nonce: crypto3.randomUUID() };
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = crypto3.createHmac("sha256", secret).update(encodedPayload, "utf8").digest();
  return `${encodedPayload}.${base64Url(signature)}`;
}
function verifyGoogleDriveOAuthState({ state, secret, now = Date.now() }) {
  requireSecret(secret, "Google OAuth state secret");
  const [encodedPayload, encodedSignature, ...extra] = state.split(".");
  if (!encodedPayload || !encodedSignature || extra.length) throw new Error("OAuth state is invalid.");
  const expectedSignature = crypto3.createHmac("sha256", secret).update(encodedPayload, "utf8").digest();
  if (!secureEqual(expectedSignature, decodeBase64Url(encodedSignature))) throw new Error("OAuth state signature is invalid.");
  let payload;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload).toString("utf8"));
  } catch {
    throw new Error("OAuth state is invalid.");
  }
  if (payload.version !== 1 || !payload.userId || !Number.isSafeInteger(payload.expiresAt) || payload.expiresAt < now) throw new Error("OAuth state is expired or invalid.");
  return { userId: payload.userId };
}
function encryptionKey(rawKey) {
  if (!/^[a-f0-9]{64}$/i.test(rawKey)) throw new Error("Google OAuth credential encryption key is invalid.");
  return Buffer.from(rawKey, "hex");
}
function encryptGoogleDriveRefreshToken(refreshToken, rawKey) {
  if (!refreshToken) throw new Error("Google OAuth refresh token is missing.");
  const iv = crypto3.randomBytes(12);
  const cipher = crypto3.createCipheriv("aes-256-gcm", encryptionKey(rawKey), iv);
  const ciphertext = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
  return ["v1", base64Url(iv), base64Url(cipher.getAuthTag()), base64Url(ciphertext)].join(".");
}
function decryptGoogleDriveRefreshToken(storedCredential, rawKey) {
  const [version, encodedIv, encodedTag, encodedCiphertext, ...extra] = storedCredential.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext || extra.length) throw new Error("Google OAuth credential is invalid.");
  try {
    const decipher = crypto3.createDecipheriv("aes-256-gcm", encryptionKey(rawKey), decodeBase64Url(encodedIv));
    decipher.setAuthTag(decodeBase64Url(encodedTag));
    return Buffer.concat([decipher.update(decodeBase64Url(encodedCiphertext)), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Google OAuth credential cannot be decrypted.");
  }
}

// server/src/security/google-oidc-client.ts
import { OAuth2Client as OAuth2Client2 } from "google-auth-library";

// server/src/security/google-oidc.ts
import crypto4 from "node:crypto";
var STATE_TTL_MS2 = 10 * 60 * 1e3;
function base64Url2(value) {
  return Buffer.from(value).toString("base64url");
}
function decodeBase64Url2(value) {
  return Buffer.from(value, "base64url");
}
function requireSecret2(value) {
  if (!value || value.length < 16) throw new Error("Google OIDC state secret is not configured.");
}
function safeEqual(left, right) {
  return left.length === right.length && crypto4.timingSafeEqual(left, right);
}
var INTERNAL_ORIGIN = "https://audit-bgs.invalid";
function requireSafeReturnTo(value) {
  const invalid = () => new Error("Google OIDC return path is invalid.");
  if (!value.startsWith("/")) throw invalid();
  if (/[\\\u0000-\u001f\u007f]/.test(value)) throw invalid();
  if (/^\/[/\\]/.test(value)) throw invalid();
  let resolved;
  try {
    resolved = new URL(value, INTERNAL_ORIGIN);
  } catch {
    throw invalid();
  }
  if (resolved.origin !== INTERNAL_ORIGIN) throw invalid();
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
function createGoogleOidcState({ secret, returnTo, now = Date.now() }) {
  requireSecret2(secret);
  const payload = {
    version: 1,
    returnTo: requireSafeReturnTo(returnTo),
    expiresAt: now + STATE_TTL_MS2,
    nonce: crypto4.randomUUID()
  };
  const encodedPayload = base64Url2(JSON.stringify(payload));
  const signature = crypto4.createHmac("sha256", secret).update(encodedPayload, "utf8").digest();
  return `${encodedPayload}.${base64Url2(signature)}`;
}
function verifyGoogleOidcState({ state, secret, now = Date.now() }) {
  requireSecret2(secret);
  const [encodedPayload, encodedSignature, ...extra] = state.split(".");
  if (!encodedPayload || !encodedSignature || extra.length) throw new Error("Google OIDC state is invalid.");
  const expected = crypto4.createHmac("sha256", secret).update(encodedPayload, "utf8").digest();
  if (!safeEqual(expected, decodeBase64Url2(encodedSignature))) throw new Error("Google OIDC state signature is invalid.");
  let payload;
  try {
    payload = JSON.parse(decodeBase64Url2(encodedPayload).toString("utf8"));
  } catch {
    throw new Error("Google OIDC state is invalid.");
  }
  if (payload.version !== 1 || !Number.isSafeInteger(payload.expiresAt) || payload.expiresAt < now) throw new Error("Google OIDC state is expired or invalid.");
  return { returnTo: requireSafeReturnTo(payload.returnTo) };
}
function validateGoogleOidcIdentity({
  payload,
  audience,
  issuer
}) {
  const tokenAudience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!payload.sub || !payload.email || payload.email_verified !== true) throw new Error("Google OIDC email is not verified.");
  const acceptedIssuers = issuer === "https://accounts.google.com" ? /* @__PURE__ */ new Set(["https://accounts.google.com", "accounts.google.com"]) : /* @__PURE__ */ new Set([issuer]);
  if (!acceptedIssuers.has(payload.iss ?? "")) throw new Error("Google OIDC issuer is invalid.");
  if (!tokenAudience.includes(audience)) throw new Error("Google OIDC audience is invalid.");
  return {
    subject: payload.sub,
    email: payload.email.trim().toLocaleLowerCase("en-US"),
    fullName: payload.name?.trim() || payload.email
  };
}

// server/src/security/google-oidc-client.ts
function requireConfiguration() {
  const configuration = {
    clientId: process.env.GOOGLE_OIDC_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_OIDC_CLIENT_SECRET ?? "",
    redirectUri: process.env.GOOGLE_OIDC_REDIRECT_URI ?? "",
    stateSecret: process.env.GOOGLE_OIDC_STATE_SECRET ?? "",
    issuer: process.env.OIDC_ISSUER_URL ?? "",
    audience: process.env.OIDC_AUDIENCE ?? ""
  };
  if (Object.values(configuration).some((value) => !value)) throw new Error("Google OIDC is not configured.");
  return configuration;
}
function clientFor(configuration) {
  return new OAuth2Client2(configuration.clientId, configuration.clientSecret, configuration.redirectUri);
}
function createAuthorizationUrl({ returnTo }) {
  const configuration = requireConfiguration();
  const state = createGoogleOidcState({ secret: configuration.stateSecret, returnTo });
  return clientFor(configuration).generateAuthUrl({
    access_type: "online",
    prompt: "select_account",
    scope: ["openid", "email", "profile"],
    state
  });
}
async function exchangeCode({ code, state }) {
  const configuration = requireConfiguration();
  const { returnTo } = verifyGoogleOidcState({ state, secret: configuration.stateSecret });
  const client = clientFor(configuration);
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) throw new Error("Google OIDC did not return an ID token.");
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: configuration.audience });
  return {
    identity: validateGoogleOidcIdentity({ payload: ticket.getPayload() ?? {}, audience: configuration.audience, issuer: configuration.issuer }),
    returnTo
  };
}

// server/src/modules/workspace/workspace-priority.ts
function sortWatchTargets(items) {
  return [...items].sort((left, right) => {
    if (Boolean(left.isPriority) !== Boolean(right.isPriority)) return left.isPriority ? -1 : 1;
    if (left.isPriority && right.isPriority) {
      const priorityOrder = (right.prioritizedAt ?? "").localeCompare(left.prioritizedAt ?? "");
      if (priorityOrder !== 0) return priorityOrder;
    }
    return right.createdAt.localeCompare(left.createdAt);
  });
}

// server/src/modules/campaigns/campaign-service.ts
function canAccessCampaign(user, campaign) {
  if (!user.isActive || campaign.status === "ARCHIVED") return false;
  if (user.roles.includes("ADMIN")) return true;
  if (campaign.members.some((member) => member.userId === user.id)) return true;
  return Boolean(user.branchCode && campaign.branchCodes.includes(user.branchCode));
}
function validateCampaignTransition(from, to) {
  if (from === to) return;
  if (to === "ARCHIVED" && from !== "CLOSED") throw new Error("CAMPAIGN_MUST_BE_CLOSED");
  const allowed = {
    DRAFT: ["ACTIVE"],
    ACTIVE: ["CLOSED"],
    CLOSED: ["ARCHIVED", "ACTIVE"],
    ARCHIVED: []
  };
  if (!allowed[from].includes(to)) throw new Error("CAMPAIGN_TRANSITION_INVALID");
}

// server/src/modules/campaigns/campaign-document-import.ts
import JSZip2 from "jszip";
import { readSheet } from "read-excel-file/node";
var CampaignDocumentImportError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "CampaignDocumentImportError";
  }
};
var labels = {
  code: ["m\xE3 chuy\xEAn \u0111\u1EC1", "m\xE3 k\u1EBF ho\u1EA1ch", "m\xE3 ct"],
  name: ["t\xEAn chuy\xEAn \u0111\u1EC1", "chuy\xEAn \u0111\u1EC1 ki\u1EC3m tra", "t\xEAn k\u1EBF ho\u1EA1ch"],
  description: ["m\xF4 t\u1EA3", "n\u1ED9i dung ki\u1EC3m tra", "ph\u1EA1m vi ki\u1EC3m tra"],
  decisionNo: ["s\u1ED1 quy\u1EBFt \u0111\u1ECBnh", "quy\u1EBFt \u0111\u1ECBnh", "s\u1ED1 q\u0111"],
  startDate: ["t\u1EEB ng\xE0y", "ng\xE0y b\u1EAFt \u0111\u1EA7u", "th\u1EDDi gian b\u1EAFt \u0111\u1EA7u"],
  endDate: ["\u0111\u1EBFn ng\xE0y", "ng\xE0y k\u1EBFt th\xFAc", "th\u1EDDi gian k\u1EBFt th\xFAc"]
};
function documentKind(fileName) {
  const extension = fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (extension === "docx") return "DOCX";
  if (extension === "pdf") return "PDF";
  if (extension === "xlsx" || extension === "xls") return "EXCEL";
  throw new CampaignDocumentImportError("Ch\u1EC9 h\u1ED7 tr\u1EE3 t\u1EC7p DOCX, PDF ho\u1EB7c Excel (.xlsx, .xls).");
}
function decodeXml(value) {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
function cleanText(value) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\r/g, "").trim();
}
function normalizeLabel(value) {
  return cleanText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d");
}
function toIsoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const text = cleanText(String(value ?? ""));
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const vietnamese = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  if (vietnamese) return `${vietnamese[3]}-${vietnamese[2].padStart(2, "0")}-${vietnamese[1].padStart(2, "0")}`;
  return void 0;
}
function textDraft(lines) {
  const draft = {};
  for (const [field, fieldLabels] of Object.entries(labels)) {
    const found = lines.find((line) => {
      const normalized = normalizeLabel(line);
      return fieldLabels.some((label) => normalized.startsWith(normalizeLabel(label)));
    });
    if (!found) continue;
    const value = cleanText(found.replace(/^.*?(?::|–|-)/, ""));
    if (!value || value === cleanText(found)) continue;
    if (field === "startDate" || field === "endDate") {
      const date = toIsoDate(value);
      if (date) draft[field] = date;
    } else {
      draft[field] = value;
    }
  }
  if (!draft.name) {
    const heading = lines.find((line) => /^chuyên đề(?: kiểm tra)?\b/i.test(line));
    if (heading) draft.name = cleanText(heading.replace(/^chuyên đề(?: kiểm tra)?\s*[:\-–]?\s*/i, "")) || heading;
  }
  return draft;
}
function warningsFor(draft) {
  const missing2 = [
    ["code", "m\xE3 chuy\xEAn \u0111\u1EC1"],
    ["name", "t\xEAn chuy\xEAn \u0111\u1EC1"],
    ["decisionNo", "s\u1ED1 quy\u1EBFt \u0111\u1ECBnh"],
    ["startDate", "ng\xE0y b\u1EAFt \u0111\u1EA7u"],
    ["endDate", "ng\xE0y k\u1EBFt th\xFAc"]
  ].filter(([key]) => !draft[key]).map(([, label]) => label);
  return [
    ...missing2.length ? [`Ch\u01B0a tr\xEDch xu\u1EA5t \u0111\u01B0\u1EE3c ${missing2.join(", ")}; h\xE3y b\u1ED5 sung tr\u01B0\u1EDBc khi l\u01B0u.`] : [],
    "Tr\u01B0\u1EDFng \u0111o\xE0n, th\xE0nh vi\xEAn, chi nh\xE1nh v\xE0 lo\u1EA1i b\xE1o c\xE1o kh\xF4ng t\u1EF1 suy di\u1EC5n t\u1EEB t\u1EC7p; qu\u1EA3n tr\u1ECB vi\xEAn ph\u1EA3i ch\u1ECDn tr\u01B0\u1EDBc khi l\u01B0u."
  ];
}
async function extractDocxLines(buffer) {
  let zip;
  try {
    zip = await JSZip2.loadAsync(buffer);
  } catch {
    throw new CampaignDocumentImportError("T\u1EC7p DOCX kh\xF4ng h\u1EE3p l\u1EC7 ho\u1EB7c kh\xF4ng th\u1EC3 m\u1EDF.");
  }
  const source = zip.file("word/document.xml");
  if (!source) throw new CampaignDocumentImportError("T\u1EC7p DOCX kh\xF4ng c\xF3 n\u1ED9i dung v\u0103n b\u1EA3n \u0111\u1EC3 tr\xEDch xu\u1EA5t.");
  const xml = await source.async("string");
  return (xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? []).map((paragraph) => cleanText(decodeXml(paragraph.replace(/<w:tab\s*\/>/g, " ").replace(/<w:t[^>]*>/g, "").replace(/<\/w:t>/g, "").replace(/<[^>]+>/g, " ")))).filter(Boolean);
}
async function extractPdfLines(buffer) {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const document = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages = await Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
      const content = await (await document.getPage(index + 1)).getTextContent();
      return content.items.map((item) => "str" in item ? item.str : "").join(" ");
    }));
    return pages.map(cleanText).filter(Boolean);
  } catch {
    throw new CampaignDocumentImportError("Kh\xF4ng th\u1EC3 \u0111\u1ECDc v\u0103n b\u1EA3n trong PDF. N\u1EBFu \u0111\xE2y l\xE0 b\u1EA3n scan, h\xE3y d\xF9ng PDF c\xF3 OCR ho\u1EB7c nh\u1EADp th\u1EE7 c\xF4ng.");
  }
}
async function extractExcelDraft(buffer) {
  let rows;
  try {
    rows = await readSheet(buffer);
  } catch {
    throw new CampaignDocumentImportError("T\u1EC7p Excel kh\xF4ng h\u1EE3p l\u1EC7 ho\u1EB7c kh\xF4ng th\u1EC3 \u0111\u1ECDc.");
  }
  const headerIndex = rows.findIndex((row) => row.some((cell) => labels.name.some((label) => normalizeLabel(String(cell ?? "")).includes(normalizeLabel(label)))));
  if (headerIndex < 0) throw new CampaignDocumentImportError("Kh\xF4ng t\xECm th\u1EA5y d\xF2ng ti\xEAu \u0111\u1EC1 Excel cho chuy\xEAn \u0111\u1EC1.");
  const headers = rows[headerIndex].map((cell) => normalizeLabel(String(cell ?? "")));
  const values = rows.slice(headerIndex + 1).find((row) => row.some((cell) => cleanText(String(cell ?? ""))));
  if (!values) throw new CampaignDocumentImportError("Excel ch\u01B0a c\xF3 d\xF2ng d\u1EEF li\u1EC7u chuy\xEAn \u0111\u1EC1 \u0111\u1EC3 tr\xEDch xu\u1EA5t.");
  const draft = {};
  for (const [field, fieldLabels] of Object.entries(labels)) {
    const column = headers.findIndex((header) => fieldLabels.some((label) => header.includes(normalizeLabel(label))));
    if (column < 0) continue;
    const value = values[column];
    if (value === null || value === void 0 || cleanText(String(value)) === "") continue;
    if (field === "startDate" || field === "endDate") {
      const date = toIsoDate(value);
      if (date) draft[field] = date;
    } else {
      draft[field] = cleanText(String(value));
    }
  }
  return draft;
}
async function extractCampaignImportDraft(fileName, buffer) {
  if (!buffer.length) throw new CampaignDocumentImportError("T\u1EC7p t\u1EA3i l\xEAn \u0111ang tr\u1ED1ng.");
  const kind = documentKind(fileName);
  const draft = kind === "EXCEL" ? await extractExcelDraft(buffer) : textDraft(kind === "DOCX" ? await extractDocxLines(buffer) : await extractPdfLines(buffer));
  return { source: { fileName, kind }, draft, warnings: warningsFor(draft) };
}

// server/src/app.ts
var app = fastify({
  logger: process.env.NODE_ENV !== "test",
  // Trên Vercel mọi yêu cầu đi qua edge proxy, nên nếu không tin x-forwarded-for thì req.ip luôn
  // là IP của proxy và nhật ký an ninh sẽ ghi cùng một địa chỉ cho tất cả mọi người. Bật ở đây
  // chỉ ảnh hưởng tới việc ghi nhật ký — không có quyết định phân quyền nào dựa trên IP.
  trustProxy: process.env.TRUST_PROXY === "true" || process.env.VERCEL === "1"
});
var allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000").split(",").map((origin) => origin.trim()).filter(Boolean);
app.register(cors, { origin: allowedOrigins, credentials: true });
var API_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  // Tệp HTML báo cáo tự chứa toàn bộ CSS trong thẻ <style> nội tuyến và không nạp gì từ bên ngoài.
  "img-src 'self' data:",
  "style-src 'unsafe-inline'"
].join("; ");
app.addHook("onSend", async (_request, reply) => {
  reply.header("Content-Security-Policy", API_CONTENT_SECURITY_POLICY);
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "no-referrer");
  reply.header("Cross-Origin-Opener-Policy", "same-origin");
  reply.header("Cross-Origin-Resource-Policy", "same-origin");
  reply.header("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()");
  reply.header("Cache-Control", "no-store");
  if (process.env.NODE_ENV === "production") {
    reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
});
app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });
var internalSlaPath = "/api/v1/internal/sla/run";
var publicPaths = /* @__PURE__ */ new Set([
  "/api/v1/health",
  "/api/v1/ready",
  "/api/v1/auth/login",
  "/api/v1/auth/logout",
  "/api/v1/auth/google",
  "/api/v1/auth/google/callback",
  internalSlaPath
]);
var requestUsers = /* @__PURE__ */ new WeakMap();
var authSessionStore;
function cookieValue(request, name) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return void 0;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return void 0;
}
async function createAuthenticatedSession(user, reply) {
  const session = authSessionStore.create(user.id);
  authSessions = authSessionStore.records();
  await persistLocalState();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  reply.header("set-cookie", `audit_bgs_session=${encodeURIComponent(session.token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${secure}`);
  return session.record.expiresAt;
}
app.addHook("preHandler", async (request) => {
  if (publicPaths.has(request.url.split("?")[0])) return;
  const allowTestUserHeader = process.env.NODE_ENV === "test" && process.env.ALLOW_TEST_USER_HEADER !== "false";
  const user = allowTestUserHeader && request.headers["x-user-id"] ? resolveLocalUser(request.headers["x-user-id"], appUsers) : (() => {
    const session = authSessionStore.resolve(cookieValue(request, "audit_bgs_session") ?? "");
    const sessionUser = session ? appUsers.find((item) => item.id === session.userId && item.isActive) : void 0;
    if (!sessionUser) {
      throw new HttpProblem(401, "AUTH_REQUIRED", "Ch\u01B0a x\xE1c th\u1EF1c", "Vui l\xF2ng \u0111\u0103ng nh\u1EADp \u0111\u1EC3 ti\u1EBFp t\u1EE5c.");
    }
    return sessionUser;
  })();
  requestUsers.set(request, user);
});
app.setErrorHandler((error, request, reply) => {
  const problem = normalizeProblem(error);
  if (problem.status >= 500) request.log.error(error);
  return sendProblem(reply, problem, request);
});
var orgUnits = [
  { id: "org-ho", code: "HO_AUDIT", name: "Ban Ki\u1EC3m To\xE1n N\u1ED9i B\u1ED9 & H\u1ED9i S\u1EDF", type: "HEAD_OFFICE", isActive: true, createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() },
  { id: "org-team-credit-audit", code: "TEAM_CREDIT_AUDIT_01", name: "Nh\xF3m Ki\u1EC3m to\xE1n T\xEDn d\u1EE5ng 01", type: "INTERNAL_TEAM", parentId: "org-ho", leaderUserId: "user-internal-supervisor", leaderName: "Tr\u1EA7n L\xE3nh \u0110\u1EA1o (Gi\xE1m \u0110\u1ED1c Ban Ki\u1EC3m To\xE1n)", isActive: true, createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() },
  { id: "org-team-compliance", code: "TEAM_COMPLIANCE_01", name: "Nh\xF3m Gi\xE1m s\xE1t Tu\xE2n th\u1EE7 01", type: "INTERNAL_TEAM", parentId: "org-ho", isActive: true, createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() },
  { id: "org-cluster-tn", code: "CUM_TAY_NGUYEN", name: "C\u1EE5m T\xE2y Nguy\xEAn", type: "CLUSTER", parentId: "org-ho", isActive: true, createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() },
  { id: "org-cluster-hcm", code: "CUM_TPHCM", name: "C\u1EE5m TP. H\u1ED3 Ch\xED Minh", type: "CLUSTER", parentId: "org-ho", isActive: true, createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() },
  { id: "org-cluster-mb", code: "CUM_MIEN_BAC", name: "C\u1EE5m Mi\u1EC1n B\u1EAFc", type: "CLUSTER", parentId: "org-ho", isActive: true, createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() },
  { id: "org-br-635", code: "635", name: "Chi nh\xE1nh Nam Bu\xF4n H\u1ED3", type: "BRANCH", parentId: "org-cluster-tn", isActive: true, createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() },
  { id: "org-br-428", code: "428", name: "Chi nh\xE1nh B\xECnh T\xE2y S\xE0i G\xF2n", type: "BRANCH", parentId: "org-cluster-hcm", isActive: true, createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() },
  { id: "org-br-102", code: "102", name: "Chi nh\xE1nh H\xE0 N\u1ED9i", type: "BRANCH", parentId: "org-cluster-mb", isActive: true, createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() },
  { id: "org-dept-635-qlkh1", code: "635-QLKH1", name: "Ph\xF2ng QLKH 1", type: "DEPARTMENT", parentId: "org-br-635", isActive: true, createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() },
  { id: "org-dept-635-pgd1", code: "635-PGD-NBH1", name: "PGD Nam Bu\xF4n H\u1ED3 1", type: "DEPARTMENT", parentId: "org-br-635", isActive: true, createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() },
  { id: "org-dept-635-control", code: "635-KSCN", name: "Ph\xF2ng Ki\u1EC3m so\xE1t chi nh\xE1nh", type: "DEPARTMENT", parentId: "org-br-635", isActive: true, createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() },
  { id: "org-dept-428-control", code: "428-KSCN", name: "Ph\xF2ng Ki\u1EC3m so\xE1t chi nh\xE1nh", type: "DEPARTMENT", parentId: "org-br-428", isActive: true, createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() },
  { id: "org-dept-102-control", code: "102-KSCN", name: "Ph\xF2ng Ki\u1EC3m so\xE1t chi nh\xE1nh", type: "DEPARTMENT", parentId: "org-br-102", isActive: true, createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() }
];
var appUsers = [
  {
    id: "user-admin",
    username: "admin.hethong",
    email: "admin.hethong@bidv.com.vn",
    googleWorkspaceEmail: "admin.hethong@bidv.com.vn",
    fullName: "Qu\u1EA3n tr\u1ECB h\u1EC7 th\u1ED1ng",
    portal: "INTERNAL",
    roles: ["ADMIN"],
    primaryRole: "ADMIN",
    coplusRole: "ADMIN_HT",
    isActive: true,
    scopes: [{ scopeType: "ALL" }]
  },
  {
    id: "user-internal-supervisor",
    username: "linhlbk",
    email: "linhlbk@bidv.com.vn",
    googleWorkspaceEmail: "linhlbk@bidv.com.vn",
    fullName: "L\xEA B\xE1 Kh\xE1nh Linh",
    portal: "INTERNAL",
    roles: ["SUPERVISOR", "INTERNAL_APPROVER"],
    primaryRole: "SUPERVISOR",
    coplusRole: "GD_KTGSTT",
    orgUnitId: "org-team-credit-audit",
    internalTeamId: "org-team-credit-audit",
    internalTeamName: "Nh\xF3m Ki\u1EC3m to\xE1n T\xEDn d\u1EE5ng 01",
    teamRole: "LEAD",
    isActive: true,
    scopes: [{ scopeType: "ALL" }]
  },
  {
    id: "user-internal-officer",
    username: "bachtd",
    email: "bachtd@bidv.com.vn",
    googleWorkspaceEmail: "bachtd@bidv.com.vn",
    fullName: "Tr\u1EA7n \u0110\u1EE9c B\xE1ch",
    portal: "INTERNAL",
    roles: ["INTERNAL_OFFICER"],
    primaryRole: "INTERNAL_OFFICER",
    coplusRole: "CB1_KTGSTT",
    orgUnitId: "org-team-credit-audit",
    internalTeamId: "org-team-credit-audit",
    internalTeamName: "Nh\xF3m Ki\u1EC3m to\xE1n T\xEDn d\u1EE5ng 01",
    teamRole: "MEMBER",
    isActive: true,
    scopes: [{ scopeType: "ALL" }]
  },
  {
    id: "user-branch-controller-635",
    username: "lyltk1",
    email: "lyltk1@bidv.com.vn",
    googleWorkspaceEmail: "lyltk1@bidv.com.vn",
    fullName: "L\xEA Tr\u1EA7n Kh\xE1nh Ly",
    portal: "BRANCH",
    roles: ["BRANCH_CONTROLLER"],
    primaryRole: "BRANCH_CONTROLLER",
    coplusRole: "CB_GSKT_TH",
    clusterName: "C\u1EE5m T\xE2y Nguy\xEAn",
    branchCode: "635",
    branchName: "Chi nh\xE1nh Nam Bu\xF4n H\u1ED3",
    department: "Ph\xF2ng Ki\u1EC3m so\xE1t chi nh\xE1nh",
    orgUnitId: "org-dept-635-control",
    isActive: true,
    scopes: [{ scopeType: "BRANCH", orgUnitCode: "635", branchName: "Chi nh\xE1nh Nam Bu\xF4n H\u1ED3", departmentName: "Ph\xF2ng Ki\u1EC3m so\xE1t chi nh\xE1nh" }]
  },
  {
    id: "user-branch-635",
    username: "cbht635",
    email: "cbht635@bidv.com.vn",
    googleWorkspaceEmail: "cbht635@bidv.com.vn",
    fullName: "C\xE1n b\u1ED9 h\u1ED7 tr\u1EE3 Chi nh\xE1nh 635",
    portal: "BRANCH",
    roles: ["BRANCH_INPUT"],
    primaryRole: "BRANCH_INPUT",
    coplusRole: "CBHT_CN",
    clusterName: "C\u1EE5m T\xE2y Nguy\xEAn",
    branchCode: "635",
    branchName: "Chi nh\xE1nh Nam Bu\xF4n H\u1ED3",
    department: "Ph\xF2ng QLKH 1",
    orgUnitId: "org-dept-635-qlkh1",
    isActive: true,
    scopes: [{ scopeType: "BRANCH", orgUnitCode: "635", branchName: "Chi nh\xE1nh Nam Bu\xF4n H\u1ED3", departmentName: "Ph\xF2ng QLKH 1" }]
  }
];
var localCredentialDirectory = [
  { userId: "user-admin", username: "admin.hethong", passwordHash: "scrypt$Iz-9-bO6hiTIOLX98U_7eA$EVcAruaxiY8MajQHWtmaspzx4cYKGqHQZ0FRYT3t8w2mRXhmv89aFfhTA6Y0FXTllT_AEz-5jPN4JLhg1xfORw" },
  { userId: "user-internal-supervisor", username: "linhlbk", passwordHash: "scrypt$zAXoKo_uSEcAI8Dvpv8hRw$UJzSMH8-o7huRxrV6WFS_d_GMTCmGGbhk5HyIKGuMkZj7R5s__dIHpQyAGMyKWkbdTIwijGhdGYoUOTKzNc7QA" },
  { userId: "user-internal-officer", username: "bachtd", passwordHash: "scrypt$lVdTI3PuwA54RehGTQZBxQ$IGT21IRWsvZrqmdrQ-zUJXRkaDq0YXAWN13QHvp_EcYWMcS4z6DHoTDTmJT0xT54dBLUR6Fl4C5gWOSvwTBKcw" },
  { userId: "user-branch-635", username: "cbht635", passwordHash: "scrypt$UXll5zvffNMvKlxnna_zug$BtNbTsIRF1lwmfw_v6XMmUp6QlIUYNflrLcWv-za0kWtFhWN_U37jvUnqLWp_NY3jKC17qBD4Ww4cRlp5EhlrA" },
  { userId: "user-branch-controller-635", username: "lyltk1", passwordHash: "scrypt$nvyImPhtUF9nPkzkyy23Mg$420xPsZvvCZdtmQphbG8SyekPNOhR4rR_BOk-LX5eLydqrAj6HnagKgple4hUgZ6IFBPMamSKwqcJj6l3Xx9xw" }
];
var seedUserDirectory = appUsers.map((user) => structuredClone(user));
var auditCampaigns = [{
  id: "campaign-regular-2026",
  code: "TX-2026",
  name: "Ki\u1EC3m tra th\u01B0\u1EDDng xuy\xEAn 2026",
  decisionNo: "Q\u0110-KTNB-2026",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  status: "ACTIVE",
  leadUserId: "user-internal-supervisor",
  members: [
    { userId: "user-internal-supervisor", memberRole: "LEAD", assignedBranchCodes: ["635", "428", "102"] },
    { userId: "user-internal-officer", memberRole: "MEMBER", assignedBranchCodes: ["635", "428", "102"] }
  ],
  branchCodes: ["635", "428", "102"],
  reportChannelIds: ["chan-audit-bgs"],
  driveProvisionStatus: "NOT_CONFIGURED",
  version: 1,
  createdByUserId: "user-admin",
  createdAt: (/* @__PURE__ */ new Date()).toISOString(),
  updatedAt: (/* @__PURE__ */ new Date()).toISOString()
}];
var defaultSlaConfig = () => ({
  defaultDays: 15,
  highRiskDays: 7,
  mediumRiskDays: 15,
  lowRiskDays: 30,
  escalationAfterDaysOverdue: 1,
  reminderDaysBefore: [3, 1]
});
var wholeNumberAtLeast = (value, minimum) => Number.isInteger(value) && value >= minimum ? value : void 0;
function normalizedSlaConfig(config) {
  const fallback = defaultSlaConfig();
  return {
    defaultDays: wholeNumberAtLeast(config?.defaultDays, 1) ?? fallback.defaultDays,
    highRiskDays: wholeNumberAtLeast(config?.highRiskDays, 1) ?? fallback.highRiskDays,
    mediumRiskDays: wholeNumberAtLeast(config?.mediumRiskDays, 1) ?? fallback.mediumRiskDays,
    lowRiskDays: wholeNumberAtLeast(config?.lowRiskDays, 1) ?? fallback.lowRiskDays,
    escalationAfterDaysOverdue: wholeNumberAtLeast(config?.escalationAfterDaysOverdue, 0) ?? fallback.escalationAfterDaysOverdue,
    reminderDaysBefore: Array.isArray(config?.reminderDaysBefore) && config.reminderDaysBefore.every((day) => Number.isInteger(day) && day >= 0) ? config.reminderDaysBefore : fallback.reminderDaysBefore
  };
}
function defaultSchemaConfig(channelCode = "report_type") {
  return {
    tableName: channelCode.toLowerCase(),
    fields: [],
    excelHeaderRowIndex: 1,
    dataStartRowIndex: 2,
    formTemplate: {
      name: "M\u1EABu nh\u1EADp b\xE1o c\xE1o",
      source: "MANUAL",
      presentationMode: "CASE_REVIEW",
      allowEvidenceAttachments: true,
      blocks: [{ id: "section_default", type: "SECTION", title: "Th\xF4ng tin b\xE1o c\xE1o", width: "FULL" }]
    }
  };
}
function defaultWorkflowConfig(channelId = "", workflowType = "TWO_TIER") {
  const branchStage = {
    stageId: "branch-remediation",
    stageName: "Chi nh\xE1nh kh\u1EAFc ph\u1EE5c",
    statusCode: "PENDING",
    allowedRoles: ["BRANCH_INPUT"],
    availableButtons: []
  };
  const branchControlStage = {
    stageId: "branch-control",
    stageName: "Ki\u1EC3m so\xE1t chi nh\xE1nh",
    statusCode: "SUBMITTED_BRANCH",
    allowedRoles: ["BRANCH_CONTROLLER"],
    availableButtons: []
  };
  const headOfficeStage = {
    stageId: "head-office-approval",
    stageName: "Ph\xEA duy\u1EC7t HT",
    statusCode: "SUBMITTED_INTERNAL",
    allowedRoles: ["INTERNAL_APPROVER", "SUPERVISOR"],
    availableButtons: []
  };
  const branchLeaderStage = {
    stageId: "branch-leader",
    stageName: "L\xE3nh \u0111\u1EA1o chi nh\xE1nh",
    statusCode: "SUBMITTED_BRANCH_LEADER",
    allowedRoles: ["BRANCH_LEADER"],
    availableButtons: []
  };
  return {
    id: `workflow-${channelId || "draft"}`,
    channelId,
    workflowType,
    stages: workflowType === "ONE_TIER" ? [branchStage, headOfficeStage] : workflowType === "THREE_TIER" ? [branchStage, branchControlStage, branchLeaderStage, headOfficeStage] : [branchStage, branchControlStage, headOfficeStage]
  };
}
function defaultIntegrationConfig() {
  return {
    googleSheets: {
      enabled: false,
      sheetName: "AuditBGS",
      syncMode: "APPEND"
    },
    email: {
      enabled: false,
      sendOnSubmission: true,
      sendBeforeDeadline: true,
      sendWhenOverdue: true,
      sendTime: "08:00",
      recipientRoles: ["INTERNAL_APPROVER"],
      additionalRecipients: [],
      subjectTemplate: "[Audit BGS] {{reportName}} - {{status}}"
    }
  };
}
function normalizedReportChannel(channel) {
  const configVersion = Number.isInteger(channel.configVersion) && channel.configVersion > 0 ? channel.configVersion : 1;
  const currentVersionId = channel.currentVersionId || `${channel.id}-v${configVersion}`;
  const workflowType = channel.workflowConfig?.workflowType === "ONE_TIER" ? "ONE_TIER" : channel.workflowConfig?.workflowType === "THREE_TIER" ? "THREE_TIER" : "TWO_TIER";
  return {
    ...channel,
    configVersion,
    currentVersionId,
    schemaConfig: channel.schemaConfig ?? defaultSchemaConfig(channel.code),
    workflowConfig: channel.workflowConfig ? { ...channel.workflowConfig, id: `${currentVersionId}-workflow`, channelId: channel.id, workflowType } : { ...defaultWorkflowConfig(channel.id, workflowType), id: `${currentVersionId}-workflow` },
    slaConfig: normalizedSlaConfig(channel.slaConfig),
    integrationConfig: channel.integrationConfig ?? defaultIntegrationConfig()
  };
}
var reportChannels = [
  {
    id: "chan-audit-bgs",
    code: "AUDIT_BGS",
    name: "Ki\u1EC3m to\xE1n T\xEDn d\u1EE5ng & Sai s\xF3t BGS Th\u01B0\u1EDDng xuy\xEAn",
    description: "K\xEAnh b\xE1o c\xE1o ki\u1EC3m to\xE1n th\u01B0\u1EDDng xuy\xEAn theo Quy\u1EBFt \u0111\u1ECBnh \u0111\u1ECBnh k\u1EF3 to\xE0n qu\u1ED1c.",
    category: "REGULAR_AUDIT",
    icon: "ShieldAlert",
    badgeColor: "blue",
    inputMethods: ["EXCEL_IMPORT", "WEB_FORM"],
    issuingDepartment: "Ban Ki\u1EC3m to\xE1n N\u1ED9i b\u1ED9",
    slaConfig: defaultSlaConfig(),
    isActive: true,
    configVersion: 1,
    currentVersionId: "chan-audit-bgs-v1",
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: "chan-aml",
    code: "COMPLIANCE_AML",
    name: "Gi\xE1m s\xE1t Tu\xE2n th\u1EE7 & Ph\xF2ng ch\u1ED1ng R\u1EEDa ti\u1EC1n (AML)",
    description: "Theo d\xF5i c\xE1c s\u1EF1 v\u1EE5 ph\xE1t sinh t\u1EEB h\u1EC7 th\u1ED1ng l\u1ECDc giao d\u1ECBch \u0111\xE1ng ng\u1EDD.",
    category: "COMPLIANCE_AML",
    icon: "FileSpreadsheet",
    badgeColor: "emerald",
    inputMethods: ["EXCEL_IMPORT", "WEB_FORM"],
    issuingDepartment: "Kh\u1ED1i Gi\xE1m s\xE1t & Tu\xE2n th\u1EE7",
    slaConfig: defaultSlaConfig(),
    isActive: true,
    configVersion: 1,
    currentVersionId: "chan-aml-v1",
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: "chan-op-risk",
    code: "OPERATIONAL_RISK",
    name: "B\xE1o c\xE1o R\u1EE7i ro V\u1EADn h\xE0nh & S\u1EF1 v\u1EE5 Chi nh\xE1nh",
    description: "K\xEAnh ti\u1EBFp nh\u1EADn c\xE1c s\u1EF1 c\u1ED1 v\u1EADn h\xE0nh ph\xE1t sinh \u0111\u1ED9t xu\u1EA5t.",
    category: "OPERATIONAL_RISK",
    icon: "Flame",
    badgeColor: "purple",
    inputMethods: ["WEB_FORM"],
    issuingDepartment: "Kh\u1ED1i Qu\u1EA3n tr\u1ECB R\u1EE7i ro",
    slaConfig: defaultSlaConfig(),
    isActive: true,
    configVersion: 1,
    currentVersionId: "chan-oprisk-v1",
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  }
];
var findings = [
  {
    id: "find-001",
    channelId: "chan-audit-bgs",
    channelCode: "AUDIT_BGS",
    channelName: "Ki\u1EC3m to\xE1n T\xEDn d\u1EE5ng & Sai s\xF3t BGS Th\u01B0\u1EDDng xuy\xEAn",
    channelVersionId: "v1",
    workflowVersionId: "wf-v1",
    slaPolicyVersionId: "sla-v1",
    cif: "10482910",
    customerName: "C\xF4ng ty TNHH C\xE0 Ph\xEA T\xE2y Nguy\xEAn Xanh",
    clusterName: "C\u1EE5m T\xE2y Nguy\xEAn",
    branchCode: "635",
    branchName: "Chi nh\xE1nh Nam Bu\xF4n H\u1ED3",
    department: "Ph\xF2ng QLKH 1",
    decisionNo: "Q\u0110-KTNB-2026/08",
    auditDate: "2026-08-15",
    inspectorName: "L\xEA C\xE1n B\u1ED9 Ki\u1EC3m Tra",
    creditBalance: 14500,
    loanGroup: "Nh\xF3m 1",
    collateralValue: 22e3,
    loanPurpose: "B\u1ED5 sung v\u1ED1n l\u01B0u \u0111\u1ED9ng thu mua c\xE0 ph\xEA v\u1EE5 m\xF9a 2026",
    officerName: "Ph\u1EA1m C\xE1n B\u1ED9 QLKH",
    deptHeadName: "Tr\u1EA7n Tr\u01B0\u1EDFng Ph\xF2ng",
    errorCode: "TD01.01",
    inspectionTeamCode: "635.2026.1",
    sourceRecordCode: "635.TBBTD.2026.1",
    businessLine: "TIN_DUNG",
    riskLevel: "CAO",
    penaltyProposalCode: "1.1.2",
    referenceDocument: "Q\u0110 1234/Q\u0110-BIDV v\u1EC1 c\u1EA5p t\xEDn d\u1EE5ng",
    errorGroup: "TD01",
    errorTitle: "Ch\u01B0a thu th\u1EADp \u0111\u1EA7y \u0111\u1EE7 ch\u1EE9ng t\u1EEB gi\u1EA3i ng\xE2n m\u1EE5c \u0111\xEDch s\u1EED d\u1EE5ng v\u1ED1n",
    description: "Kh\xE1ch h\xE0ng ch\u01B0a cung c\u1EA5p h\xF3a \u0111\u01A1n GTGT \u0111i\u1EC7n t\u1EED \u0111\u1EE3t gi\u1EA3i ng\xE2n ng\xE0y 10/05/2026 tr\u1ECB gi\xE1 3.5 t\u1EF7 VN\u0110 theo cam k\u1EBFt h\u1EE3p \u0111\u1ED3ng t\xEDn d\u1EE5ng.",
    quantity: 1,
    exposureAmount: 3500,
    workflowStatus: "PENDING",
    slaStatus: "DUE_SOON",
    version: 1,
    deadlineDate: "2026-08-30",
    isOverdue: false,
    evidenceCount: 0,
    createdAt: "2026-08-15T08:00:00.000Z",
    updatedAt: "2026-08-15T08:00:00.000Z"
  },
  {
    id: "find-002",
    channelId: "chan-audit-bgs",
    channelCode: "AUDIT_BGS",
    channelName: "Ki\u1EC3m to\xE1n T\xEDn d\u1EE5ng & Sai s\xF3t BGS Th\u01B0\u1EDDng xuy\xEAn",
    channelVersionId: "v1",
    workflowVersionId: "wf-v1",
    slaPolicyVersionId: "sla-v1",
    cif: "10849201",
    customerName: "Doanh nghi\u1EC7p T\u01B0 nh\xE2n V\u1EADn t\u1EA3i Ho\xE0ng Long",
    clusterName: "C\u1EE5m TP. H\u1ED3 Ch\xED Minh",
    branchCode: "428",
    branchName: "Chi nh\xE1nh B\xECnh T\xE2y S\xE0i G\xF2n",
    department: "Ph\xF2ng QLKH 2",
    decisionNo: "Q\u0110-KTNB-2026/08",
    auditDate: "2026-08-15",
    inspectorName: "L\xEA C\xE1n B\u1ED9 Ki\u1EC3m Tra",
    creditBalance: 8200,
    loanGroup: "Nh\xF3m 1",
    collateralValue: 15e3,
    loanPurpose: "Mua xe \u0111\u1EA7u k\xE9o v\u1EADn t\u1EA3i container",
    officerName: "Nguy\u1EC5n V\u0103n Minh",
    deptHeadName: "L\xEA Qu\u1ED1c B\u1EA3o",
    errorCode: "TD02.05",
    inspectionTeamCode: "428.2026.1",
    sourceRecordCode: "428.TBBTD.2026.1",
    businessLine: "TIN_DUNG",
    riskLevel: "TRUNG_BINH",
    penaltyProposalCode: "5.3.2",
    referenceDocument: "Q\u0110 1234/Q\u0110-BIDV v\u1EC1 h\u1ED3 s\u01A1 ph\xE1p l\xFD",
    errorGroup: "TD02",
    errorTitle: "Ch\u01B0a ho\xE0n t\u1EA5t \u0111\u0103ng k\xFD bi\u1EBFn \u0111\u1ED9ng giao d\u1ECBch b\u1EA3o \u0111\u1EA3m t\xE0i s\u1EA3n",
    description: "H\u1ED3 s\u01A1 th\u1EBF ch\u1EA5p quy\u1EC1n s\u1EED d\u1EE5ng \u0111\u1EA5t s\u1ED1 AB123456 ch\u01B0a c\xF3 d\u1EA5u x\xE1c nh\u1EADn c\u1EE7a V\u0103n ph\xF2ng \u0110\u0103ng k\xFD \u0111\u1EA5t \u0111ai chi nh\xE1nh Qu\u1EADn 6.",
    quantity: 1,
    exposureAmount: 4200,
    workflowStatus: "SUBMITTED_BRANCH",
    slaStatus: "ON_TRACK",
    version: 2,
    deadlineDate: "2026-09-10",
    isOverdue: false,
    resolutionNotes: "Chi nh\xE1nh \u0111\xE3 n\u1ED9p h\u1ED3 s\u01A1 xin c\u1EA5p s\u1ED5 v\xE0 b\u1ED5 sung phi\u1EBFu h\u1EB9n c\u1EE7a VP \u0110\u0103ng k\xFD \u0111\u1EA5t \u0111ai.",
    evidenceCount: 1,
    createdAt: "2026-08-15T08:00:00.000Z",
    updatedAt: "2026-08-20T10:30:00.000Z"
  },
  {
    id: "find-003",
    channelId: "chan-audit-bgs",
    channelCode: "AUDIT_BGS",
    channelName: "Ki\u1EC3m to\xE1n T\xEDn d\u1EE5ng & Sai s\xF3t BGS Th\u01B0\u1EDDng xuy\xEAn",
    channelVersionId: "v1",
    workflowVersionId: "wf-v1",
    slaPolicyVersionId: "sla-v1",
    cif: "10993821",
    customerName: "C\xF4ng ty CP May Xu\u1EA5t Kh\u1EA9u H\xE0 N\u1ED9i",
    clusterName: "C\u1EE5m Mi\u1EC1n B\u1EAFc",
    branchCode: "102",
    branchName: "Chi nh\xE1nh H\xE0 N\u1ED9i",
    department: "Ph\xF2ng QLKH 1",
    decisionNo: "Q\u0110-KTNB-2026/07",
    auditDate: "2026-07-20",
    inspectorName: "V\u0169 Ki\u1EC3m To\xE1n Vi\xEAn",
    creditBalance: 25e3,
    loanGroup: "Nh\xF3m 1",
    collateralValue: 4e4,
    errorCode: "TD03.02",
    inspectionTeamCode: "102.2026.1",
    sourceRecordCode: "102.TBBTD.2026.1",
    businessLine: "TIN_DUNG",
    riskLevel: "CAO",
    penaltyProposalCode: "7.4",
    referenceDocument: "Q\u0110 5678/Q\u0110-BIDV v\u1EC1 m\u1EE5c \u0111\xEDch vay v\u1ED1n",
    errorGroup: "TD03",
    errorTitle: "Bi\xEAn b\u1EA3n ki\u1EC3m tra th\u1EF1c \u0111\u1ECBa sau vay v\u01B0\u1EE3t qu\xE1 90 ng\xE0y",
    description: "Ch\u01B0a th\u1EF1c hi\u1EC7n ki\u1EC3m tra t\xECnh h\xECnh ho\u1EA1t \u0111\u1ED9ng kho x\u01B0\u1EDFng \u0111\u1ECBnh k\u1EF3 Qu\xFD 2/2026.",
    quantity: 1,
    exposureAmount: 6e3,
    workflowStatus: "SUBMITTED_INTERNAL",
    slaStatus: "ON_TRACK",
    version: 3,
    deadlineDate: "2026-08-28",
    isOverdue: false,
    resolutionNotes: "C\xE1n b\u1ED9 \u0111\xE3 l\u1EADp bi\xEAn b\u1EA3n ki\u1EC3m tra th\u1EF1c t\u1EBF kho x\u01B0\u1EDFng ng\xE0y 18/08/2026, \u0111\xEDnh k\xE8m \u0111\u1EA7y \u0111\u1EE7 \u1EA3nh ch\u1EE5p v\xE0 h\xF3a \u0111\u01A1n xu\u1EA5t nh\u1EADp kho.",
    evidenceCount: 2,
    createdAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-08-22T14:15:00.000Z"
  },
  {
    id: "find-004",
    channelId: "chan-audit-bgs",
    channelCode: "AUDIT_BGS",
    channelName: "Ki\u1EC3m to\xE1n T\xEDn d\u1EE5ng & Sai s\xF3t BGS Th\u01B0\u1EDDng xuy\xEAn",
    channelVersionId: "v1",
    workflowVersionId: "wf-v1",
    slaPolicyVersionId: "sla-v1",
    cif: "10482910",
    customerName: "C\xF4ng ty TNHH C\xE0 Ph\xEA T\xE2y Nguy\xEAn Xanh",
    clusterName: "C\u1EE5m T\xE2y Nguy\xEAn",
    branchCode: "635",
    branchName: "Chi nh\xE1nh Nam Bu\xF4n H\u1ED3",
    department: "Ph\xF2ng QLKH 1",
    decisionNo: "Q\u0110-KTNB-2026/08",
    auditDate: "2026-08-15",
    inspectorName: "L\xEA C\xE1n B\u1ED9 Ki\u1EC3m Tra",
    creditBalance: 14500,
    loanGroup: "Nh\xF3m 1",
    collateralValue: 22e3,
    loanPurpose: "B\u1ED5 sung v\u1ED1n l\u01B0u \u0111\u1ED9ng thu mua c\xE0 ph\xEA v\u1EE5 m\xF9a 2026",
    officerName: "Ph\u1EA1m C\xE1n B\u1ED9 QLKH",
    deptHeadName: "Tr\u1EA7n Tr\u01B0\u1EDFng Ph\xF2ng",
    errorCode: "TD05.05",
    inspectionTeamCode: "635.2026.1",
    sourceRecordCode: "635.TBBTD.2026.2",
    businessLine: "PHI_TIN_DUNG",
    riskLevel: "THAP",
    penaltyProposalCode: "9.1.4",
    referenceDocument: "Q\u0110 5678/Q\u0110-BIDV v\u1EC1 ki\u1EC3m tra sau vay",
    errorGroup: "TD05",
    errorTitle: "Ch\u01B0a r\xE0 so\xE1t \u0111\u1EA7y \u0111\u1EE7 \u0111i\u1EC1u ki\u1EC7n gi\u1EA3i ng\xE2n",
    description: "H\u1ED3 s\u01A1 gi\u1EA3i ng\xE2n ch\u01B0a c\xF3 bi\xEAn b\u1EA3n \u0111\u1ED1i chi\u1EBFu \u0111i\u1EC1u ki\u1EC7n c\u1EA5p t\xEDn d\u1EE5ng theo danh m\u1EE5c ki\u1EC3m tra b\u1EAFt bu\u1ED9c.",
    quantity: 1,
    exposureAmount: 2100,
    workflowStatus: "SUBMITTED_BRANCH",
    slaStatus: "ON_TRACK",
    version: 2,
    deadlineDate: "2026-09-05",
    isOverdue: false,
    resolutionNotes: "Chi nh\xE1nh \u0111\xE3 b\u1ED5 sung bi\xEAn b\u1EA3n \u0111\u1ED1i chi\u1EBFu v\xE0 g\u1EEDi Ki\u1EC3m so\xE1t chi nh\xE1nh xem x\xE9t.",
    evidenceCount: 0,
    createdAt: "2026-08-15T08:05:00.000Z",
    updatedAt: "2026-08-23T09:10:00.000Z"
  }
];
var workflowEvents = [
  {
    id: "evt-001",
    findingId: "find-002",
    command: "SUBMIT_BRANCH",
    fromStatus: "PENDING",
    toStatus: "SUBMITTED_BRANCH",
    actorUserId: "user-branch-428",
    actorName: "Nguy\u1EC5n V\u0103n Minh",
    actorRole: "BRANCH_INPUT",
    notes: "Chi nh\xE1nh \u0111\xE3 n\u1ED9p h\u1ED3 s\u01A1 xin c\u1EA5p s\u1ED5 v\xE0 b\u1ED5 sung phi\u1EBFu h\u1EB9n c\u1EE7a VP \u0110\u0103ng k\xFD \u0111\u1EA5t \u0111ai.",
    createdAt: "2026-08-20T10:30:00.000Z"
  },
  {
    id: "evt-002",
    findingId: "find-003",
    command: "SUBMIT_BRANCH",
    fromStatus: "PENDING",
    toStatus: "SUBMITTED_BRANCH",
    actorUserId: "user-branch-102",
    actorName: "Tr\u1EA7n V\u0103n C\xE1n B\u1ED9",
    actorRole: "BRANCH_INPUT",
    notes: "\u0110\xE3 ho\xE0n th\xE0nh ki\u1EC3m tra kho x\u01B0\u1EDFng th\u1EF1c t\u1EBF.",
    createdAt: "2026-08-21T09:00:00.000Z"
  },
  {
    id: "evt-003",
    findingId: "find-003",
    command: "BRANCH_CONTROL_APPROVE",
    fromStatus: "SUBMITTED_BRANCH",
    toStatus: "SUBMITTED_INTERNAL",
    actorUserId: "user-branch-controller-102",
    actorName: "Ki\u1EC3m so\xE1t Chi nh\xE1nh H\xE0 N\u1ED9i",
    actorRole: "BRANCH_CONTROLLER",
    notes: "Ki\u1EC3m so\xE1t chi nh\xE1nh \u0111\xE3 th\u1EA9m tra h\u1ED3 s\u01A1 \u0111\u1EA7y \u0111\u1EE7, chuy\u1EC3n Kh\u1ED1i N\u1ED9i B\u1ED9 ph\xEA duy\u1EC7t b\u1ECF l\u1ED7i.",
    createdAt: "2026-08-22T14:15:00.000Z"
  }
];
var evidences = [
  {
    id: "evi-001",
    findingId: "find-002",
    fileName: "Phieu_hen_dang_ky_bien_dong_dat_dai.pdf",
    fileSize: 1048576,
    mimeType: "application/pdf",
    driveFileId: "drive_mock_001",
    driveUrl: "/api/v1/evidence/drive_mock_001/content",
    sha256Checksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    status: "AVAILABLE",
    uploadedByUserId: "user-branch-428",
    uploadedByName: "Nguy\u1EC5n V\u0103n Minh",
    uploadedByRole: "BRANCH_INPUT",
    versionNumber: 1,
    notes: "B\u1EA3n scan phi\u1EBFu h\u1EB9n c\xF3 d\u1EA5u \u0111\u1ECF c\u1EE7a c\u01A1 quan nh\xE0 n\u01B0\u1EDBc.",
    createdAt: "2026-08-20T10:28:00.000Z",
    updatedAt: "2026-08-20T10:28:00.000Z"
  },
  {
    id: "evi-002",
    findingId: "find-003",
    fileName: "Bien_ban_kiem_tra_kho_xuong_thuc_dia.pdf",
    fileSize: 2097152,
    mimeType: "application/pdf",
    driveFileId: "drive_mock_002",
    driveUrl: "/api/v1/evidence/drive_mock_002/content",
    sha256Checksum: "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
    status: "AVAILABLE",
    uploadedByUserId: "user-branch-102",
    uploadedByName: "Tr\u1EA7n V\u0103n C\xE1n B\u1ED9",
    uploadedByRole: "BRANCH_INPUT",
    versionNumber: 1,
    notes: "Bi\xEAn b\u1EA3n ki\u1EC3m tra c\xF3 ch\u1EEF k\xFD \u0111\u1EA1i di\u1EC7n doanh nghi\u1EC7p v\xE0 \u1EA3nh ch\u1EE5p t\xE0i s\u1EA3n.",
    createdAt: "2026-08-21T08:50:00.000Z",
    updatedAt: "2026-08-21T08:50:00.000Z"
  }
];
var importBatches = [];
var slaExtensions = [];
var reportDefinitions = [];
var REPORT_EXPORT_MAX_ROWS = Math.max(1, Number(process.env.REPORT_EXPORT_MAX_ROWS) || 1e4);
var DEFAULT_REPORT_EXPORT_FIELDS = /* @__PURE__ */ new Set([
  "dimension.campaign",
  "dimension.campaign_decision",
  "dimension.cif",
  "dimension.customer",
  "dimension.cluster",
  "dimension.branch",
  "dimension.department",
  "dimension.officer",
  "dimension.error_code",
  "dimension.workflow_status",
  "measure.credit_balance",
  "measure.exposure",
  "date.deadline"
]);
var DEFAULT_REPORT_METRICS = /* @__PURE__ */ new Set([
  "metric.customer_count",
  "metric.finding_count",
  "metric.exposure_sum"
]);
function createDefaultReportCatalogConfiguration() {
  return {
    version: 1,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    fields: REPORT_FIELD_CATALOG.map((field, index) => ({
      ...field,
      isActive: true,
      defaultExport: DEFAULT_REPORT_EXPORT_FIELDS.has(field.key),
      sortOrder: index
    })),
    metrics: REPORT_METRIC_CATALOG.map((metric, index) => ({
      ...metric,
      isActive: DEFAULT_REPORT_METRICS.has(metric.key),
      sortOrder: index
    }))
  };
}
var reportCatalogConfiguration = createDefaultReportCatalogConfiguration();
var idempotencyRecords = {};
var findingFollows = [];
var workspaceAccepted = [];
var workspaceWatchTargets = [];
var reportChannelVersions = [];
var authSessions = [];
var googleDriveOAuthCredential;
var securityEvents = [];
var loginAttempts = [];
var DEMO_SEED_ENABLED = process.env.NODE_ENV === "production" ? false : process.env.SEED_DEMO_DATA !== "false";
var DEMO_SEED_IDS = {
  users: appUsers.map((user) => user.id),
  orgUnits: orgUnits.map((unit) => unit.id),
  campaigns: auditCampaigns.map((campaign) => campaign.id),
  findings: findings.map((finding) => finding.id)
};
function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto5.randomBytes(20);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
var credentialDirectory = [...localCredentialDirectory];
var unknownUserPasswordHash = await hashPassword(crypto5.randomUUID());
if (!DEMO_SEED_ENABLED) {
  appUsers = [];
  orgUnits = [];
  auditCampaigns = [];
  findings = [];
  workflowEvents = [];
  evidences = [];
  credentialDirectory = [];
}
var stateRepository = createStateRepository({
  filePath: process.env.LOCAL_STATE_FILE ?? path4.join(process.cwd(), "data", "local-state.json"),
  dataStoreMode: process.env.DATA_STORE_MODE,
  persistenceEnabled: process.env.NODE_ENV !== "test",
  snapshotId: process.env.STATE_SNAPSHOT_ID ?? (process.env.NODE_ENV === "test" ? `test-${process.pid}-${crypto5.randomUUID().slice(0, 8)}` : void 0)
});
var hydratedState = await stateRepository.load({
  orgUnits,
  appUsers,
  reportChannels,
  reportChannelVersions,
  findings,
  workflowEvents,
  evidences,
  importBatches,
  slaExtensions,
  reportDefinitions,
  reportCatalogConfiguration,
  idempotencyRecords,
  findingFollows,
  workspaceAccepted,
  workspaceWatchTargets,
  authSessions,
  auditCampaigns,
  credentials: credentialDirectory,
  googleDriveOAuthCredential,
  securityEvents,
  loginAttempts
});
orgUnits = hydratedState.orgUnits;
appUsers = hydratedState.appUsers;
if (hydratedState.credentials?.length) credentialDirectory = hydratedState.credentials;
reportChannels = hydratedState.reportChannels.map(normalizedReportChannel);
reportChannelVersions = hydratedState.reportChannelVersions ?? [];
if (!reportChannelVersions.length) {
  reportChannelVersions = reportChannels.map((channel) => ({
    id: channel.currentVersionId,
    channelId: channel.id,
    versionNumber: channel.configVersion,
    snapshot: structuredClone(channel),
    createdByUserId: "system",
    createdAt: channel.updatedAt
  }));
}
var channelSlaBackfilled = (() => {
  let changed = false;
  reportChannels = reportChannels.map((channel) => {
    const slaConfig = normalizedSlaConfig(channel.slaConfig);
    if (JSON.stringify(channel.slaConfig) === JSON.stringify(slaConfig)) return channel;
    changed = true;
    return { ...channel, slaConfig };
  });
  return changed;
})();
findings = hydratedState.findings;
findings = findings.map(ensureFindingSubItems);
workflowEvents = hydratedState.workflowEvents;
evidences = hydratedState.evidences;
importBatches = hydratedState.importBatches;
slaExtensions = hydratedState.slaExtensions;
reportDefinitions = hydratedState.reportDefinitions;
reportCatalogConfiguration = hydratedState.reportCatalogConfiguration ?? createDefaultReportCatalogConfiguration();
idempotencyRecords = hydratedState.idempotencyRecords ?? {};
findingFollows = hydratedState.findingFollows ?? [];
workspaceAccepted = hydratedState.workspaceAccepted ?? [];
workspaceWatchTargets = hydratedState.workspaceWatchTargets ?? [];
authSessions = hydratedState.authSessions ?? [];
securityEvents = hydratedState.securityEvents ?? [];
loginAttempts = hydratedState.loginAttempts ?? [];
authSessionStore = new AuthSessionStore({ records: authSessions });
auditCampaigns = hydratedState.auditCampaigns?.length ? hydratedState.auditCampaigns : auditCampaigns;
googleDriveOAuthCredential = hydratedState.googleDriveOAuthCredential;
function googleOAuthStateSecret() {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET;
  if (!secret || secret.length < 16) throw new HttpProblem(503, "GOOGLE_OAUTH_NOT_CONFIGURED", "OAuth Google Drive ch\u01B0a \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh", "Thi\u1EBFu GOOGLE_OAUTH_STATE_SECRET tr\xEAn m\xE1y ch\u1EE7.");
  return secret;
}
function googleOAuthEncryptionKey() {
  const key = process.env.GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!key) throw new HttpProblem(503, "GOOGLE_OAUTH_NOT_CONFIGURED", "OAuth Google Drive ch\u01B0a \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh", "Thi\u1EBFu GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY tr\xEAn m\xE1y ch\u1EE7.");
  return key;
}
function hydrateGoogleDriveOAuthCredential(credential) {
  googleDriveOAuthCredential = credential;
  if (!credential) return;
  try {
    googleDriveService.setOAuthRefreshToken(decryptGoogleDriveRefreshToken(credential.encryptedRefreshToken, googleOAuthEncryptionKey()));
  } catch {
    googleDriveService.setOAuthRefreshToken(void 0);
  }
}
hydrateGoogleDriveOAuthCredential(googleDriveOAuthCredential);
function backfillUserCoPlusIdentity() {
  let changed = false;
  const seedById = new Map(seedUserDirectory.map((user) => [user.id, user]));
  appUsers = appUsers.map((user) => {
    const seed = seedById.get(user.id);
    const next = seed ? { ...user, username: seed.username, fullName: seed.fullName, email: seed.email, googleWorkspaceEmail: seed.googleWorkspaceEmail, coplusRole: seed.coplusRole } : { ...user, coplusRole: user.coplusRole ?? inferCoPlusRole(user.roles) };
    if (JSON.stringify(next) === JSON.stringify(user)) return user;
    changed = true;
    return next;
  });
  return changed;
}
var STARTER_FORM_TEMPLATES = {
  COMPLIANCE_AML: {
    tableName: "compliance_aml",
    excelHeaderRowIndex: 1,
    dataStartRowIndex: 2,
    fields: [
      { fieldKey: "ma_giao_dich", label: "M\xE3 giao d\u1ECBch", dataType: "string", isRequired: true, excelHeaderAliases: ["M\xE3 giao d\u1ECBch"], displayOrder: 1, showInTableGrid: true },
      { fieldKey: "loai_canh_bao", label: "Lo\u1EA1i c\u1EA3nh b\xE1o", dataType: "select", isRequired: true, excelHeaderAliases: ["Lo\u1EA1i c\u1EA3nh b\xE1o"], displayOrder: 2, showInTableGrid: true, dropdownOptions: [
        { label: "Giao d\u1ECBch \u0111\xE1ng ng\u1EDD", value: "giao_dich_dang_ngo" },
        { label: "V\u01B0\u1EE3t ng\u01B0\u1EE1ng b\xE1o c\xE1o", value: "vuot_nguong_bao_cao" },
        { label: "Tr\xF9ng danh s\xE1ch c\u1EA5m v\u1EADn", value: "trung_danh_sach_cam_van" }
      ] },
      { fieldKey: "ngay_canh_bao", label: "Ng\xE0y c\u1EA3nh b\xE1o", dataType: "date", isRequired: false, excelHeaderAliases: ["Ng\xE0y c\u1EA3nh b\xE1o"], displayOrder: 3, showInTableGrid: true },
      { fieldKey: "gia_tri_giao_dich", label: "Gi\xE1 tr\u1ECB giao d\u1ECBch (tri\u1EC7u \u0111\u1ED3ng)", dataType: "currency", isRequired: false, excelHeaderAliases: ["Gi\xE1 tr\u1ECB giao d\u1ECBch"], displayOrder: 4, showInTableGrid: true },
      { fieldKey: "ket_luan_ra_soat", label: "K\u1EBFt lu\u1EADn r\xE0 so\xE1t", dataType: "textarea", isRequired: false, excelHeaderAliases: ["K\u1EBFt lu\u1EADn r\xE0 so\xE1t"], displayOrder: 5, showInTableGrid: false }
    ],
    formTemplate: {
      name: "M\u1EABu r\xE0 so\xE1t c\u1EA3nh b\xE1o AML",
      source: "MANUAL",
      presentationMode: "CASE_REVIEW",
      allowEvidenceAttachments: true,
      blocks: [
        { id: "aml_section_1", type: "SECTION", title: "N\u1ED8I DUNG R\xC0 SO\xC1T", width: "FULL" },
        { id: "aml_sub_1", type: "SUBSECTION", title: "Th\xF4ng tin c\u1EA3nh b\xE1o", width: "FULL" },
        { id: "aml_f_1", type: "FIELD", fieldKey: "ma_giao_dich", width: "THIRD" },
        { id: "aml_f_2", type: "FIELD", fieldKey: "loai_canh_bao", width: "THIRD" },
        { id: "aml_f_3", type: "FIELD", fieldKey: "ngay_canh_bao", width: "THIRD" },
        { id: "aml_f_4", type: "FIELD", fieldKey: "gia_tri_giao_dich", width: "THIRD" },
        { id: "aml_sub_2", type: "SUBSECTION", title: "K\u1EBFt lu\u1EADn", width: "FULL" },
        { id: "aml_f_5", type: "FIELD", fieldKey: "ket_luan_ra_soat", width: "FULL" }
      ]
    }
  },
  OPERATIONAL_RISK: {
    tableName: "operational_risk",
    excelHeaderRowIndex: 1,
    dataStartRowIndex: 2,
    fields: [
      { fieldKey: "su_kien_rui_ro", label: "S\u1EF1 ki\u1EC7n r\u1EE7i ro", dataType: "string", isRequired: true, excelHeaderAliases: ["S\u1EF1 ki\u1EC7n r\u1EE7i ro"], displayOrder: 1, showInTableGrid: true },
      { fieldKey: "bo_phan_phat_sinh", label: "B\u1ED9 ph\u1EADn ph\xE1t sinh", dataType: "string", isRequired: false, excelHeaderAliases: ["B\u1ED9 ph\u1EADn ph\xE1t sinh"], displayOrder: 2, showInTableGrid: true },
      { fieldKey: "ngay_phat_sinh", label: "Ng\xE0y ph\xE1t sinh", dataType: "date", isRequired: false, excelHeaderAliases: ["Ng\xE0y ph\xE1t sinh"], displayOrder: 3, showInTableGrid: true },
      { fieldKey: "ton_that_uoc_tinh", label: "T\u1ED5n th\u1EA5t \u01B0\u1EDBc t\xEDnh (tri\u1EC7u \u0111\u1ED3ng)", dataType: "currency", isRequired: false, excelHeaderAliases: ["T\u1ED5n th\u1EA5t \u01B0\u1EDBc t\xEDnh"], displayOrder: 4, showInTableGrid: true },
      { fieldKey: "bien_phap_xu_ly", label: "Bi\u1EC7n ph\xE1p x\u1EED l\xFD", dataType: "string", isRequired: false, excelHeaderAliases: ["Bi\u1EC7n ph\xE1p x\u1EED l\xFD"], displayOrder: 5, showInTableGrid: true }
    ],
    formTemplate: {
      name: "B\u1EA3ng ghi nh\u1EADn s\u1EF1 v\u1EE5 r\u1EE7i ro v\u1EADn h\xE0nh",
      source: "MANUAL",
      presentationMode: "EXCEL_GRID",
      allowEvidenceAttachments: false,
      blocks: [
        { id: "opr_section_1", type: "SECTION", title: "S\u1EF0 V\u1EE4 R\u1EE6I RO V\u1EACN H\xC0NH", width: "FULL" },
        { id: "opr_f_1", type: "FIELD", fieldKey: "su_kien_rui_ro", width: "THIRD" },
        { id: "opr_f_2", type: "FIELD", fieldKey: "bo_phan_phat_sinh", width: "THIRD" },
        { id: "opr_f_3", type: "FIELD", fieldKey: "ngay_phat_sinh", width: "THIRD" },
        { id: "opr_f_4", type: "FIELD", fieldKey: "ton_that_uoc_tinh", width: "THIRD" },
        { id: "opr_f_5", type: "FIELD", fieldKey: "bien_phap_xu_ly", width: "THIRD" }
      ]
    }
  }
};
function backfillChannelFormTemplates() {
  let changed = false;
  const starterChannelIds = /* @__PURE__ */ new Set();
  reportChannels = reportChannels.map((channel) => {
    const starter = STARTER_FORM_TEMPLATES[channel.code.toUpperCase()];
    if (!starter) return channel;
    starterChannelIds.add(channel.id);
    const hasTemplate = (channel.schemaConfig?.formTemplate?.blocks.length ?? 0) > 0 || (channel.schemaConfig?.fields.length ?? 0) > 0;
    if (hasTemplate) return channel;
    changed = true;
    return { ...channel, schemaConfig: structuredClone(starter) };
  });
  reportChannelVersions = reportChannelVersions.map((version) => {
    if (!starterChannelIds.has(version.channelId)) return version;
    if ((version.snapshot.schemaConfig?.formTemplate?.blocks.length ?? 0) > 0) return version;
    const channel = reportChannels.find((item) => item.id === version.channelId);
    if (!channel?.schemaConfig?.formTemplate) return version;
    changed = true;
    return { ...version, snapshot: { ...version.snapshot, schemaConfig: structuredClone(channel.schemaConfig) } };
  });
  return changed;
}
function backfillFindingProvenance() {
  let changed = false;
  findings = findings.map((finding) => {
    const campaignId = finding.campaignId ?? "campaign-regular-2026";
    const inspectionTeamCode = finding.inspectionTeamCode ?? auditCampaigns.find((campaign) => campaign.id === campaignId)?.code;
    const businessLine = finding.businessLine ?? (finding.errorCode.toUpperCase().startsWith("TD") ? "TIN_DUNG" : void 0);
    if (campaignId === finding.campaignId && inspectionTeamCode === finding.inspectionTeamCode && businessLine === finding.businessLine) return finding;
    changed = true;
    return { ...finding, campaignId, inspectionTeamCode, businessLine };
  });
  return changed;
}
function normalizeFindingSpecialCase(finding) {
  if (typeof finding.isSpecialCase === "boolean") return finding;
  return { ...finding, isSpecialCase: Boolean(finding.approvalRoute?.requiresBranchLeaderApproval) };
}
function backfillFindingSpecialCase() {
  let changed = false;
  findings = findings.map((finding) => {
    const normalized = normalizeFindingSpecialCase(finding);
    if (normalized !== finding) changed = true;
    return normalized;
  });
  return changed;
}
function currentLocalState() {
  return {
    orgUnits,
    appUsers,
    reportChannels,
    reportChannelVersions,
    findings,
    workflowEvents,
    evidences,
    importBatches,
    slaExtensions,
    reportDefinitions,
    reportCatalogConfiguration,
    idempotencyRecords,
    findingFollows,
    workspaceAccepted,
    workspaceWatchTargets,
    authSessions,
    auditCampaigns,
    credentials: credentialDirectory,
    googleDriveOAuthCredential,
    securityEvents,
    loginAttempts
  };
}
var durableState = new DurableStateCoordinator(currentLocalState());
function restoreDurableLocalState(restored) {
  orgUnits = restored.orgUnits;
  appUsers = restored.appUsers;
  reportChannels = restored.reportChannels;
  reportChannelVersions = restored.reportChannelVersions ?? [];
  findings = restored.findings.map((finding) => ensureFindingSubItems(normalizeFindingSpecialCase(finding)));
  workflowEvents = restored.workflowEvents;
  evidences = restored.evidences;
  importBatches = restored.importBatches;
  slaExtensions = restored.slaExtensions;
  reportDefinitions = restored.reportDefinitions;
  reportCatalogConfiguration = restored.reportCatalogConfiguration ?? createDefaultReportCatalogConfiguration();
  idempotencyRecords = restored.idempotencyRecords ?? {};
  findingFollows = restored.findingFollows ?? [];
  workspaceAccepted = restored.workspaceAccepted ?? [];
  workspaceWatchTargets = restored.workspaceWatchTargets ?? [];
  authSessions = restored.authSessions ?? [];
  securityEvents = restored.securityEvents ?? [];
  loginAttempts = restored.loginAttempts ?? [];
  authSessionStore = new AuthSessionStore({ records: authSessions });
  auditCampaigns = restored.auditCampaigns?.length ? restored.auditCampaigns : auditCampaigns;
  if (restored.credentials?.length) credentialDirectory = restored.credentials;
  hydrateGoogleDriveOAuthCredential(restored.googleDriveOAuthCredential);
}
var runtimeRequestLock = new RuntimeRequestLock();
var runtimeRequestReleases = /* @__PURE__ */ new WeakMap();
function releaseRuntimeRequest(request) {
  const release = runtimeRequestReleases.get(request);
  runtimeRequestReleases.delete(request);
  release?.();
}
app.addHook("onRequest", async (request) => {
  if (!shouldHydrateRuntimeStatePerRequest(process.env, request.url, request.method)) return;
  const release = await runtimeRequestLock.acquire();
  runtimeRequestReleases.set(request, release);
  try {
    const latest = await stateRepository.load(currentLocalState());
    restoreDurableLocalState(latest);
    durableState.hydrate(latest);
  } catch (error) {
    releaseRuntimeRequest(request);
    throw error;
  }
});
app.addHook("onResponse", async (request) => {
  releaseRuntimeRequest(request);
});
app.addHook("onError", async (request) => {
  releaseRuntimeRequest(request);
});
async function persistLocalState() {
  const base = durableState.snapshot();
  const snapshot = currentLocalState();
  const saved = await durableState.persistAsync(
    async () => stateRepository.update(snapshot, (latest) => threeWayMergeState(base, snapshot, latest)),
    restoreDurableLocalState
  );
  restoreDurableLocalState(saved);
}
async function evaluateCurrentSlaState() {
  let result = { updatedCount: 0, overdueCount: 0, dueSoonCount: 0 };
  const saved = await durableState.persistAsync(
    async () => stateRepository.update(currentLocalState(), (latest) => {
      result = runSlaEvaluation(latest.findings);
    }),
    restoreDurableLocalState
  );
  restoreDurableLocalState(saved);
  return { evaluatedCount: saved.findings.length, ...result };
}
function synchronizeUserDirectoryModel() {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  let changed = false;
  const baselineTeams = [
    {
      id: "org-team-credit-audit",
      code: "TEAM_CREDIT_AUDIT_01",
      name: "Nh\xF3m Ki\u1EC3m to\xE1n T\xEDn d\u1EE5ng 01",
      type: "INTERNAL_TEAM",
      parentId: "org-ho",
      leaderUserId: "user-internal-supervisor",
      leaderName: "Tr\u1EA7n L\xE3nh \u0110\u1EA1o (Gi\xE1m \u0110\u1ED1c Ban Ki\u1EC3m To\xE1n)",
      isActive: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "org-team-compliance",
      code: "TEAM_COMPLIANCE_01",
      name: "Nh\xF3m Gi\xE1m s\xE1t Tu\xE2n th\u1EE7 01",
      type: "INTERNAL_TEAM",
      parentId: "org-ho",
      isActive: true,
      createdAt: now,
      updatedAt: now
    }
  ];
  for (const team of baselineTeams) {
    if (!orgUnits.some((unit) => unit.id === team.id || unit.code === team.code)) {
      orgUnits.push(team);
      changed = true;
    }
  }
  const creditTeam = orgUnits.find((unit) => unit.id === "org-team-credit-audit");
  for (const user of appUsers) {
    const credential = credentialDirectory.find((item) => item.userId === user.id);
    if (credential && user.username !== credential.username) {
      user.username = credential.username;
      changed = true;
    }
    if (!user.googleWorkspaceEmail && user.email) {
      user.googleWorkspaceEmail = user.email;
      changed = true;
    }
    if (creditTeam && user.id === "user-internal-supervisor" && !user.internalTeamId) {
      Object.assign(user, {
        orgUnitId: creditTeam.id,
        internalTeamId: creditTeam.id,
        internalTeamName: creditTeam.name,
        teamRole: "LEAD"
      });
      changed = true;
    }
    if (creditTeam && user.id === "user-internal-officer" && !user.internalTeamId) {
      Object.assign(user, {
        orgUnitId: creditTeam.id,
        internalTeamId: creditTeam.id,
        internalTeamName: creditTeam.name,
        teamRole: "MEMBER"
      });
      changed = true;
    }
    if (user.portal === "BRANCH" && user.branchCode) {
      const branch = orgUnits.find((unit) => unit.type === "BRANCH" && unit.code === user.branchCode);
      const cluster = branch ? orgUnits.find((unit) => unit.type === "CLUSTER" && unit.id === branch.parentId) : void 0;
      const department = branch ? orgUnits.find((unit) => unit.type === "DEPARTMENT" && unit.parentId === branch.id && unit.name === user.department) : void 0;
      if (branch && cluster && (user.branchName !== branch.name || user.clusterName !== cluster.name || department && user.orgUnitId !== department.id)) {
        user.branchName = branch.name;
        user.clusterName = cluster.name;
        user.orgUnitId = department?.id ?? branch.id;
        user.scopes = [{
          scopeType: "BRANCH",
          orgUnitId: branch.id,
          orgUnitCode: branch.code,
          clusterName: cluster.name,
          branchName: branch.name,
          departmentName: department?.name ?? user.department
        }];
        changed = true;
      }
    }
  }
  return changed;
}
async function bootstrapAdministratorFromEnvironment() {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim().toLocaleLowerCase("vi-VN");
  const passwordHash = process.env.BOOTSTRAP_ADMIN_PASSWORD_HASH?.trim();
  if (!username || !passwordHash) return false;
  const existing = appUsers.find((user) => user.username.toLocaleLowerCase("vi-VN") === username);
  if (existing) {
    const registered = credentialDirectory.find((item) => item.userId === existing.id);
    if (registered) registered.passwordHash = passwordHash;
    else credentialDirectory.push({ userId: existing.id, username, passwordHash });
    return false;
  }
  const admin = {
    id: `user-${crypto5.randomUUID()}`,
    username,
    email: process.env.BOOTSTRAP_ADMIN_EMAIL?.trim() || `${username}@localhost`,
    fullName: process.env.BOOTSTRAP_ADMIN_FULLNAME?.trim() || "Qu\u1EA3n tr\u1ECB h\u1EC7 th\u1ED1ng",
    portal: "INTERNAL",
    roles: ["ADMIN"],
    primaryRole: "ADMIN",
    coplusRole: "ADMIN_HT",
    isActive: true,
    scopes: [{ scopeType: "ALL" }]
  };
  appUsers.push(admin);
  credentialDirectory.push({ userId: admin.id, username, passwordHash });
  app.log.info({ username }, "\u0110\xE3 t\u1EA1o t\xE0i kho\u1EA3n qu\u1EA3n tr\u1ECB kh\u1EDFi t\u1EA1o t\u1EEB bi\u1EBFn m\xF4i tr\u01B0\u1EDDng");
  return true;
}
if ([
  channelSlaBackfilled,
  synchronizeUserDirectoryModel(),
  backfillUserCoPlusIdentity(),
  backfillChannelFormTemplates(),
  backfillFindingProvenance(),
  backfillFindingSpecialCase(),
  await bootstrapAdministratorFromEnvironment()
].some(Boolean)) await persistLocalState();
if (shouldStartEmbeddedSlaRuntime()) {
  const stopSlaRuntime = startDailySlaRuntime(async () => {
    await evaluateCurrentSlaState();
  });
  app.addHook("onClose", async () => {
    stopSlaRuntime();
  });
}
function getCurrentUser(req) {
  const user = requestUsers.get(req);
  if (!user) {
    throw new HttpProblem(401, "AUTH_REQUIRED", "Ch\u01B0a x\xE1c th\u1EF1c", "Kh\xF4ng t\xECm th\u1EA5y ng\u1EEF c\u1EA3nh ng\u01B0\u1EDDi d\xF9ng cho y\xEAu c\u1EA7u.");
  }
  return user;
}
var SECURITY_EVENT_RETENTION = 5e3;
function recordSecurityEvent(event) {
  securityEvents.push({ ...event, id: `sec-${crypto5.randomUUID()}`, occurredAt: (/* @__PURE__ */ new Date()).toISOString() });
  if (securityEvents.length > SECURITY_EVENT_RETENTION) {
    securityEvents = securityEvents.slice(-SECURITY_EVENT_RETENTION);
  }
}
function recordUserSecurityEvent(req, user, event) {
  recordSecurityEvent({
    ...event,
    actorUserId: user.id,
    actorName: user.fullName,
    actorRole: user.primaryRole,
    ipAddress: req.ip
  });
}
var LOGIN_FAILURE_LIMIT = 8;
var LOGIN_FAILURE_WINDOW_MS = 15 * 6e4;
var LOGIN_LOCKOUT_MS = 15 * 6e4;
var LOGIN_BURST_LIMIT = 300;
var LOGIN_BURST_WINDOW_MS = 6e4;
var loginBurstWindowStartedAt = 0;
var loginBurstCount = 0;
function assertLoginBurstAllowed(now) {
  if (now - loginBurstWindowStartedAt > LOGIN_BURST_WINDOW_MS) {
    loginBurstWindowStartedAt = now;
    loginBurstCount = 0;
  }
  loginBurstCount += 1;
  if (loginBurstCount > LOGIN_BURST_LIMIT) {
    throw new HttpProblem(429, "LOGIN_RATE_LIMITED", "Qu\xE1 nhi\u1EC1u y\xEAu c\u1EA7u \u0111\u0103ng nh\u1EADp", "M\xE1y ch\u1EE7 \u0111ang nh\u1EADn qu\xE1 nhi\u1EC1u l\u01B0\u1EE3t \u0111\u0103ng nh\u1EADp. H\xE3y th\u1EED l\u1EA1i sau m\u1ED9t ph\xFAt.");
  }
}
function pruneLoginAttempts(nowMs) {
  const before = loginAttempts.length;
  loginAttempts = loginAttempts.filter((item) => (item.lockedUntil ? Date.parse(item.lockedUntil) > nowMs : false) || nowMs - Date.parse(item.lastFailedAt) <= LOGIN_FAILURE_WINDOW_MS);
  return loginAttempts.length !== before;
}
function assertLoginNotLocked(usernameKey, nowMs) {
  const record = loginAttempts.find((item) => item.key === usernameKey);
  if (!record?.lockedUntil) return;
  const remainingMs = Date.parse(record.lockedUntil) - nowMs;
  if (remainingMs <= 0) return;
  const minutes = Math.max(1, Math.ceil(remainingMs / 6e4));
  throw new HttpProblem(
    429,
    "LOGIN_TEMPORARILY_LOCKED",
    "T\xE0i kho\u1EA3n t\u1EA1m kho\xE1",
    `\u0110\xE3 nh\u1EADp sai m\u1EADt kh\u1EA9u qu\xE1 ${LOGIN_FAILURE_LIMIT} l\u1EA7n. H\xE3y th\u1EED l\u1EA1i sau kho\u1EA3ng ${minutes} ph\xFAt ho\u1EB7c li\xEAn h\u1EC7 qu\u1EA3n tr\u1ECB vi\xEAn \u0111\u1EC3 \u0111\u1EB7t l\u1EA1i m\u1EADt kh\u1EA9u.`
  );
}
function recordLoginFailure(usernameKey, nowMs) {
  const now = new Date(nowMs).toISOString();
  let record = loginAttempts.find((item) => item.key === usernameKey);
  if (!record || nowMs - Date.parse(record.firstFailedAt) > LOGIN_FAILURE_WINDOW_MS) {
    record = { key: usernameKey, failedCount: 0, firstFailedAt: now, lastFailedAt: now };
    loginAttempts = [...loginAttempts.filter((item) => item.key !== usernameKey), record];
  }
  record.failedCount += 1;
  record.lastFailedAt = now;
  if (record.failedCount >= LOGIN_FAILURE_LIMIT) {
    record.lockedUntil = new Date(nowMs + LOGIN_LOCKOUT_MS).toISOString();
  }
  return { locked: Boolean(record.lockedUntil) };
}
function clearLoginFailures(usernameKey) {
  const before = loginAttempts.length;
  loginAttempts = loginAttempts.filter((item) => item.key !== usernameKey);
  return loginAttempts.length !== before;
}
function filterFindingsByScope(items, user) {
  return items.filter((finding) => hasFindingAccess(user, finding));
}
function getScopedFindingOrThrow(id, user) {
  const finding = findings.find((item) => item.id === id);
  if (!finding || !hasFindingAccess(user, finding)) {
    throw new HttpProblem(404, "FINDING_NOT_FOUND", "Kh\xF4ng t\xECm th\u1EA5y h\u1ED3 s\u01A1", "H\u1ED3 s\u01A1 kh\xF4ng t\u1ED3n t\u1EA1i ho\u1EB7c n\u1EB1m ngo\xE0i ph\u1EA1m vi d\u1EEF li\u1EC7u \u0111\u01B0\u1EE3c c\u1EA5p.");
  }
  return finding;
}
function approvalCandidatesForFinding(finding) {
  const branchUsers = appUsers.filter((user) => user.isActive && user.branchCode === finding.branchCode);
  return {
    branchControllers: branchUsers.filter((user) => user.roles.includes("BRANCH_CONTROLLER")),
    branchLeaders: branchUsers.filter((user) => user.roles.includes("BRANCH_LEADER")),
    internalApprovers: appUsers.filter((user) => user.isActive && (user.roles.includes("INTERNAL_APPROVER") || user.roles.includes("SUPERVISOR")))
  };
}
function resolveApprovalRoute(finding, workflowType, actor) {
  const candidates = approvalCandidatesForFinding(finding);
  const requiresBranchLeaderApproval = workflowType === "THREE_TIER" || Boolean(finding.isSpecialCase);
  const pick = (users) => (users.find((user) => user.id !== actor.id) ?? users[0])?.id;
  return {
    branchControllerUserId: pick(candidates.branchControllers),
    branchLeaderUserId: requiresBranchLeaderApproval ? pick(candidates.branchLeaders) : void 0,
    internalApproverUserId: void 0,
    requiresBranchLeaderApproval,
    assignedByUserId: actor.id,
    assignedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function availableEvidencesForFinding(findingId) {
  return evidences.filter((evidence) => evidence.findingId === findingId && evidence.status === "AVAILABLE");
}
function ensureFindingSubItems(finding) {
  if (finding.subItems?.length) return finding;
  const contents = finding.id === "find-003" ? [
    "Ch\u01B0a th\u1EF1c hi\u1EC7n ki\u1EC3m tra t\xECnh h\xECnh ho\u1EA1t \u0111\u1ED9ng kho x\u01B0\u1EDFng \u0111\u1ECBnh k\u1EF3 Qu\xFD 2/2026.",
    "Ch\u01B0a l\u01B0u \u0111\u1EA7y \u0111\u1EE7 \u1EA3nh ch\u1EE5p hi\u1EC7n tr\u1EA1ng h\xE0ng t\u1ED3n kho t\u1EA1i th\u1EDDi \u0111i\u1EC3m ki\u1EC3m tra.",
    "Ch\u01B0a \u0111\u1ED1i chi\u1EBFu s\u1ED1 li\u1EC7u nh\u1EADp xu\u1EA5t kho v\u1EDBi h\xF3a \u0111\u01A1n v\xE0 s\u1ED5 theo d\xF5i c\u1EE7a kh\xE1ch h\xE0ng."
  ] : [finding.description];
  return {
    ...finding,
    subItems: contents.map((content, index) => ({
      id: `${finding.id}-item-${index + 1}`,
      findingId: finding.id,
      content,
      order: index + 1,
      status: "OPEN",
      createdAt: finding.createdAt,
      updatedAt: finding.updatedAt
    }))
  };
}
function reportPresentationForFinding(finding) {
  const pinnedChannel = reportChannelVersions.find((version) => version.id === finding.channelVersionId)?.snapshot;
  const currentChannel = reportChannels.find((channel) => channel.id === finding.channelId);
  const template = (pinnedChannel ?? currentChannel)?.schemaConfig?.formTemplate;
  return {
    evidenceRequired: template?.allowEvidenceAttachments !== false,
    presentationMode: template?.presentationMode ?? "CASE_REVIEW"
  };
}
function withEvidenceProjection(finding) {
  return { ...finding, ...reportPresentationForFinding(finding), evidenceCount: availableEvidencesForFinding(finding.id).length };
}
function isActionableForUser(finding, user) {
  if (user.roles.includes("BRANCH_INPUT")) {
    return finding.workflowStatus === "PENDING" || finding.workflowStatus === "REJECTED";
  }
  if (user.roles.includes("BRANCH_CONTROLLER")) {
    return finding.workflowStatus === "SUBMITTED_BRANCH";
  }
  if (user.roles.includes("BRANCH_LEADER")) {
    return finding.workflowStatus === "SUBMITTED_BRANCH_LEADER";
  }
  if (user.roles.some((role) => ["SUPERVISOR", "INTERNAL_APPROVER", "INTERNAL_OFFICER"].includes(role))) {
    return finding.workflowStatus === "SUBMITTED_INTERNAL";
  }
  return false;
}
function withWorkspaceProjection(finding, userId) {
  return {
    ...withEvidenceProjection(finding),
    isFollowing: findingFollows.some((item) => item.userId === userId && item.findingId === finding.id)
  };
}
function workspaceTargetKey(target) {
  if (target.targetType === "CLUSTER") return `CLUSTER:${target.clusterName}`;
  if (target.targetType === "BRANCH") return `BRANCH:${target.branchCode}`;
  return `CUSTOMER:${target.branchCode}:${target.cif}`;
}
function findingsForWorkspaceTarget(target, user) {
  return filterFindingsByScope(findings, user).filter((finding) => {
    if (target.targetType === "CLUSTER") return finding.clusterName === target.clusterName;
    if (target.targetType === "BRANCH") return finding.branchCode === target.branchCode;
    return finding.branchCode === target.branchCode && finding.cif === target.cif;
  });
}
function projectWorkspaceTarget(target, user) {
  const matches = findingsForWorkspaceTarget(target, user);
  const representative = matches[0];
  if (!representative) return null;
  const label = target.targetType === "CLUSTER" ? representative.clusterName : target.targetType === "BRANCH" ? `${representative.branchCode} \xB7 ${representative.branchName}` : representative.customerName;
  return {
    id: target.id,
    targetType: target.targetType,
    targetKey: workspaceTargetKey(target),
    label,
    clusterName: representative.clusterName,
    branchCode: target.targetType === "CLUSTER" ? void 0 : representative.branchCode,
    branchName: target.targetType === "CLUSTER" ? void 0 : representative.branchName,
    cif: target.targetType === "CUSTOMER" ? representative.cif : void 0,
    customerName: target.targetType === "CUSTOMER" ? representative.customerName : void 0,
    representativeFindingId: representative.id,
    channelId: representative.channelId,
    matchedFindingCount: matches.length,
    createdAt: target.createdAt,
    isPriority: Boolean(target.isPriority),
    prioritizedAt: target.prioritizedAt
  };
}
async function addWorkspaceTarget(collection, dto, user) {
  const matches = findingsForWorkspaceTarget(dto, user);
  if (!matches.length) {
    throw new HttpProblem(404, "WORKSPACE_TARGET_NOT_FOUND", "Kh\xF4ng t\xECm th\u1EA5y ph\u1EA1m vi", "C\u1EE5m, chi nh\xE1nh ho\u1EB7c kh\xE1ch h\xE0ng kh\xF4ng t\u1ED3n t\u1EA1i trong ph\u1EA1m vi d\u1EEF li\u1EC7u \u0111\u01B0\u1EE3c c\u1EA5p.");
  }
  const key = workspaceTargetKey(dto);
  let record = collection.find((item) => item.userId === user.id && workspaceTargetKey(item) === key);
  if (!record) {
    record = { id: `workspace-${crypto5.randomUUID()}`, userId: user.id, ...dto, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
    collection.push(record);
    await persistLocalState();
  }
  return projectWorkspaceTarget(record, user);
}
function requireAvailableEvidence(finding) {
  if (!reportPresentationForFinding(finding).evidenceRequired) return;
  if (availableEvidencesForFinding(finding.id).length === 0) {
    throw new HttpProblem(
      422,
      "EVIDENCE_REQUIRED_FOR_WORKFLOW",
      "Ch\u01B0a c\xF3 b\u1EB1ng ch\u1EE9ng kh\u1EA3 d\u1EE5ng",
      "Ph\u1EA3i t\u1EA3i l\xEAn \xEDt nh\u1EA5t m\u1ED9t b\u1EB1ng ch\u1EE9ng h\u1EE3p l\u1EC7 tr\u01B0\u1EDBc khi g\u1EEDi ho\u1EB7c ph\xEA duy\u1EC7t h\u1ED3 s\u01A1."
    );
  }
}
function validateDynamicPayload(channel, dto) {
  const payload = dto.customPayload ?? {};
  for (const field of channel.schemaConfig?.fields ?? []) {
    if (field.isSystemCoreField) continue;
    const value = payload[field.fieldKey];
    const missing2 = value === void 0 || value === null || value === "";
    if (field.isRequired && missing2) {
      throw new HttpProblem(422, "DYNAMIC_FORM_INVALID", "Form b\xE1o c\xE1o ch\u01B0a h\u1EE3p l\u1EC7", `Tr\u01B0\u1EDDng \u201C${field.label}\u201D l\xE0 b\u1EAFt bu\u1ED9c.`);
    }
    if (missing2) continue;
    if ((field.dataType === "number" || field.dataType === "currency") && (typeof value !== "number" || !Number.isFinite(value))) {
      throw new HttpProblem(422, "DYNAMIC_FORM_INVALID", "Form b\xE1o c\xE1o ch\u01B0a h\u1EE3p l\u1EC7", `Tr\u01B0\u1EDDng \u201C${field.label}\u201D ph\u1EA3i l\xE0 s\u1ED1.`);
    }
    if (field.dataType === "date" && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))) {
      throw new HttpProblem(422, "DYNAMIC_FORM_INVALID", "Form b\xE1o c\xE1o ch\u01B0a h\u1EE3p l\u1EC7", `Tr\u01B0\u1EDDng \u201C${field.label}\u201D ph\u1EA3i l\xE0 ng\xE0y h\u1EE3p l\u1EC7.`);
    }
    if (field.dataType === "select" && !field.dropdownOptions?.some((option) => option.value === value)) {
      throw new HttpProblem(422, "DYNAMIC_FORM_INVALID", "Form b\xE1o c\xE1o ch\u01B0a h\u1EE3p l\u1EC7", `Gi\xE1 tr\u1ECB c\u1EE7a \u201C${field.label}\u201D kh\xF4ng n\u1EB1m trong danh s\xE1ch c\u1EA5u h\xECnh.`);
    }
  }
}
function createFindingFromDto(dto, user, id = `find-${crypto5.randomUUID()}`) {
  const channel = reportChannels.find((item) => item.id === dto.channelId && item.isActive);
  if (!channel) {
    throw new HttpProblem(422, "CHANNEL_NOT_ACTIVE", "K\xEAnh b\xE1o c\xE1o kh\xF4ng h\u1EE3p l\u1EC7", "K\xEAnh b\xE1o c\xE1o kh\xF4ng t\u1ED3n t\u1EA1i ho\u1EB7c \u0111\xE3 ng\u1EEBng ho\u1EA1t \u0111\u1ED9ng.");
  }
  const campaign = dto.campaignId ? auditCampaigns.find((item) => item.id === dto.campaignId) : void 0;
  if (dto.campaignId && (!campaign || !canAccessCampaign(user, campaign))) {
    throw new HttpProblem(422, "CAMPAIGN_NOT_AVAILABLE", "Chuy\xEAn \u0111\u1EC1 kh\xF4ng h\u1EE3p l\u1EC7", "Chuy\xEAn \u0111\u1EC1 kh\xF4ng t\u1ED3n t\u1EA1i ho\u1EB7c t\xE0i kho\u1EA3n kh\xF4ng \u0111\u01B0\u1EE3c ph\xE2n c\xF4ng.");
  }
  if (campaign && (!campaign.branchCodes.includes(dto.branchCode) || !campaign.reportChannelIds.includes(dto.channelId))) {
    throw new HttpProblem(422, "CAMPAIGN_SCOPE_MISMATCH", "Ph\u1EA1m vi chuy\xEAn \u0111\u1EC1 kh\xF4ng ph\xF9 h\u1EE3p", "Chi nh\xE1nh ho\u1EB7c lo\u1EA1i b\xE1o c\xE1o kh\xF4ng thu\u1ED9c chuy\xEAn \u0111\u1EC1 \u0111\xE3 ch\u1ECDn.");
  }
  validateDynamicPayload(channel, dto);
  const nowDate = /* @__PURE__ */ new Date();
  const now = nowDate.toISOString();
  const deadlineDate = dto.deadlineDate ?? addCalendarDays(dto.auditDate ?? toCalendarDateString(nowDate), channel.slaConfig.defaultDays);
  const newFinding = {
    id,
    campaignId: campaign?.id ?? "campaign-regular-2026",
    channelId: channel.id,
    channelCode: channel.code,
    channelName: channel.name,
    channelVersionId: channel.currentVersionId,
    workflowVersionId: `${channel.currentVersionId}-workflow`,
    slaPolicyVersionId: `${channel.currentVersionId}-sla`,
    cif: dto.cif,
    customerName: dto.customerName,
    clusterName: dto.clusterName,
    branchCode: dto.branchCode,
    branchName: dto.branchName,
    department: dto.department,
    decisionNo: dto.decisionNo,
    auditDate: dto.auditDate,
    inspectorName: dto.inspectorName || user.fullName,
    creditBalance: Number(dto.creditBalance) || 0,
    loanGroup: dto.loanGroup || "Ch\u01B0a x\xE1c \u0111\u1ECBnh",
    collateralValue: dto.collateralValue ?? 0,
    loanPurpose: dto.loanPurpose,
    officerName: dto.officerName,
    deptHeadName: dto.deptHeadName,
    errorCode: dto.errorCode,
    errorGroup: dto.errorGroup || dto.errorCode.split(".")[0],
    errorTitle: dto.errorTitle,
    description: dto.description,
    quantity: dto.quantity ?? 1,
    exposureAmount: dto.exposureAmount,
    // Provenance from the CoPlus inspection record; the campaign code stands in for the đoàn when
    // a finding is captured directly here rather than lifted from a Tiểu biên bản.
    inspectionTeamCode: dto.inspectionTeamCode ?? campaign?.code,
    sourceRecordCode: dto.sourceRecordCode,
    businessLine: dto.businessLine,
    riskLevel: dto.riskLevel,
    penaltyProposalCode: dto.penaltyProposalCode,
    referenceDocument: dto.referenceDocument,
    dynamicPayload: dto.customPayload,
    workflowStatus: "PENDING",
    slaStatus: "ON_TRACK",
    version: 1,
    deadlineDate,
    isOverdue: false,
    evidenceCount: 0,
    subItems: [{
      id: `${id}-item-1`,
      findingId: id,
      content: dto.description,
      order: 1,
      status: "OPEN",
      createdAt: now,
      updatedAt: now
    }],
    createdAt: now,
    updatedAt: now
  };
  const evaluation = slaWorker.evaluateFindingSla(newFinding, nowDate);
  newFinding.slaStatus = evaluation.slaStatus;
  newFinding.isOverdue = evaluation.isOverdue;
  return newFinding;
}
async function ensureFindingDriveFolder(finding) {
  const campaign = auditCampaigns.find((item) => item.id === finding.campaignId);
  if (!campaign || campaign.driveProvisionStatus !== "READY") return;
  if (!campaign.driveRootFolderId) {
    throw new HttpProblem(503, "CAMPAIGN_DRIVE_FOLDER_MISSING", "Kho chuy\xEAn \u0111\u1EC1 ch\u01B0a s\u1EB5n s\xE0ng", "Chuy\xEAn \u0111\u1EC1 \u0111ang thi\u1EBFu ID th\u01B0 m\u1EE5c Google Drive.");
  }
  await appsScriptDriveGateway.execute("ENSURE_ERROR_FOLDER", {
    campaignId: campaign.id,
    campaignFolderId: campaign.driveRootFolderId,
    cif: finding.cif,
    customerName: finding.customerName,
    errorCode: finding.errorCode
  });
}
function uniqueCustomerCount(items) {
  return new Set(items.map((item) => `${item.branchCode}:${item.cif}`)).size;
}
function csvCell(value) {
  const raw = String(value ?? "").replace(/\r?\n/g, " ");
  const normalized = typeof value === "string" && /^[=+\-@]/.test(raw.trimStart()) ? `'${raw}` : raw;
  return `"${normalized.replace(/"/g, '""')}"`;
}
var reportFieldAccessors = {
  "dimension.channel": (finding) => finding.channelCode,
  "dimension.campaign": (finding) => finding.campaignId ?? "",
  "dimension.campaign_decision": (finding) => auditCampaigns.find((campaign) => campaign.id === finding.campaignId)?.decisionNo ?? "",
  "dimension.cluster": (finding) => finding.clusterName,
  "dimension.branch": (finding) => finding.branchCode,
  "dimension.department": (finding) => finding.department || "",
  "dimension.cif": (finding) => finding.cif,
  "dimension.customer": (finding) => finding.customerName,
  "dimension.officer": (finding) => finding.officerName || "",
  "dimension.error_code": (finding) => finding.errorCode,
  "dimension.error_group": (finding) => finding.errorGroup ?? "",
  "dimension.workflow_status": (finding) => finding.workflowStatus,
  "dimension.sla_status": (finding) => finding.slaStatus,
  "dimension.inspection_team": (finding) => finding.inspectionTeamCode ?? "",
  "dimension.source_record": (finding) => finding.sourceRecordCode ?? "",
  "dimension.business_line": (finding) => finding.businessLine ?? "",
  "dimension.risk_level": (finding) => finding.riskLevel ?? "",
  "dimension.penalty_proposal": (finding) => finding.penaltyProposalCode ?? "",
  "date.audit": (finding) => finding.auditDate || finding.createdAt.slice(0, 10),
  "date.deadline": (finding) => finding.deadlineDate,
  "measure.credit_balance": (finding) => finding.creditBalance,
  "measure.collateral_value": (finding) => finding.collateralValue ?? 0,
  "measure.exposure": (finding) => finding.exposureAmount,
  "measure.quantity": (finding) => finding.quantity,
  "flag.overdue": (finding) => finding.isOverdue
};
var workflowStatusLabels = {
  PENDING: "Ch\u1EDD chi nh\xE1nh kh\u1EAFc ph\u1EE5c",
  SUBMITTED_BRANCH: "Ch\u1EDD Ki\u1EC3m so\xE1t chi nh\xE1nh",
  SUBMITTED_BRANCH_LEADER: "Ch\u1EDD L\xE3nh \u0111\u1EA1o chi nh\xE1nh",
  SUBMITTED_INTERNAL: "Ch\u1EDD Kh\u1ED1i N\u1ED9i B\u1ED9",
  REJECTED: "\u0110\xE3 chuy\u1EC3n tr\u1EA3",
  WAIVED_RESOLVED: "\u0110\xE3 \u0111\xF3ng l\u1ED7i"
};
var slaStatusLabels = {
  ON_TRACK: "Trong h\u1EA1n",
  DUE_SOON: "S\u1EAFp \u0111\u1EBFn h\u1EA1n",
  OVERDUE: "Qu\xE1 h\u1EA1n",
  // Was missing: a closed finding grouped or exported by SLA status rendered an empty label.
  CLOSED: "\u0110\xE3 \u0111\xF3ng"
};
function normalizedReportValue(value) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("vi-VN") : value;
}
function valuesEqual(left, right) {
  return normalizedReportValue(left) === normalizedReportValue(right);
}
function matchesReportRule(finding, rule) {
  const actual = reportFieldAccessors[rule.key](finding);
  switch (rule.operator) {
    case "op.eq":
      return rule.value !== void 0 && valuesEqual(actual, rule.value);
    case "op.neq":
      return rule.value !== void 0 && !valuesEqual(actual, rule.value);
    case "op.contains":
      return String(actual).toLocaleLowerCase("vi-VN").includes(String(rule.value).toLocaleLowerCase("vi-VN"));
    case "op.in":
      return Boolean(rule.values?.some((value) => valuesEqual(actual, value)));
    case "op.gte":
      return rule.value !== void 0 && actual >= rule.value;
    case "op.lte":
      return rule.value !== void 0 && actual <= rule.value;
    case "op.between":
      return rule.from !== void 0 && rule.to !== void 0 && actual >= rule.from && actual <= rule.to;
    case "op.is_true":
      return actual === true;
    case "op.is_false":
      return actual === false;
  }
}
function applyCanonicalReportRules(items, rules, match) {
  if (rules.length === 0) return items;
  return items.filter((finding) => match === "ANY" ? rules.some((rule) => matchesReportRule(finding, rule)) : rules.every((rule) => matchesReportRule(finding, rule)));
}
function customerRepresentatives(items) {
  return [...new Map(items.map((item) => [`${item.branchCode}:${item.cif}`, item])).values()];
}
function calculateReportMetric(items, key) {
  const customers = customerRepresentatives(items);
  switch (key) {
    case "metric.customer_count":
      return customers.length;
    case "metric.finding_count":
      return items.length;
    case "metric.exposure_sum":
      return items.reduce((sum, item) => sum + item.exposureAmount, 0);
    case "metric.credit_balance_sum":
      return customers.reduce((sum, item) => sum + item.creditBalance, 0);
    case "metric.collateral_value_sum":
      return customers.reduce((sum, item) => sum + (item.collateralValue ?? 0), 0);
    case "metric.quantity_sum":
      return items.reduce((sum, item) => sum + item.quantity, 0);
    case "metric.overdue_count":
      return items.filter((item) => item.isOverdue).length;
    case "metric.resolved_count":
      return items.filter((item) => item.workflowStatus === "WAIVED_RESOLVED").length;
    case "metric.remediation_rate":
      return items.length ? Math.round(items.filter((item) => item.workflowStatus === "WAIVED_RESOLVED").length / items.length * 1e3) / 10 : 0;
  }
}
function calculateMetricValues(items, metrics) {
  return Object.fromEntries(metrics.map((key) => [key, calculateReportMetric(items, key)]));
}
function reportValueLabel(key, value, finding) {
  if (key === "dimension.branch") return `${finding.branchCode} \xB7 ${finding.branchName}`;
  if (key === "dimension.channel") return `${finding.channelCode} \xB7 ${finding.channelName}`;
  if (key === "dimension.campaign") {
    const campaign = auditCampaigns.find((item) => item.id === finding.campaignId);
    return campaign ? `${campaign.code} \xB7 ${campaign.name}` : "Ch\u01B0a g\u1EAFn chuy\xEAn \u0111\u1EC1";
  }
  if (key === "dimension.workflow_status") return workflowStatusLabels[finding.workflowStatus];
  if (key === "dimension.sla_status") return slaStatusLabels[finding.slaStatus];
  if (key === "dimension.business_line") return finding.businessLine ? businessLineLabels[finding.businessLine] : "Ch\u01B0a ph\xE2n lo\u1EA1i";
  if (key === "dimension.risk_level") return finding.riskLevel ? riskLevelLabels[finding.riskLevel] : "Ch\u01B0a ch\u1EA5m";
  if (key === "dimension.inspection_team") return finding.inspectionTeamCode || "Ch\u01B0a g\u1EAFn \u0111o\xE0n";
  if (key === "flag.overdue") return value ? "Qu\xE1 h\u1EA1n" : "Ch\u01B0a qu\xE1 h\u1EA1n";
  return String(value || "Ch\u01B0a x\xE1c \u0111\u1ECBnh");
}
function executeReportRun(items, query) {
  const matched = applyCanonicalReportRules(items, query.rules, query.match);
  const groups = /* @__PURE__ */ new Map();
  for (const finding of matched) {
    const value = reportFieldAccessors[query.groupBy](finding);
    const key = String(value || "UNASSIGNED");
    const current = groups.get(key) || { label: reportValueLabel(query.groupBy, value, finding), items: [] };
    current.items.push(finding);
    groups.set(key, current);
  }
  const sortKey = query.sort?.key || query.metrics[0];
  const direction = query.sort?.direction === "asc" ? 1 : -1;
  const rows = [...groups.entries()].map(([key, group]) => ({
    key,
    label: group.label,
    metricValues: calculateMetricValues(group.items, query.metrics)
  })).sort((left, right) => {
    const delta = ((left.metricValues[sortKey] || 0) - (right.metricValues[sortKey] || 0)) * direction;
    return delta || left.label.localeCompare(right.label, "vi-VN");
  }).slice(0, query.limit);
  return {
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    query,
    matchedFindingCount: matched.length,
    metricValues: calculateMetricValues(matched, query.metrics),
    groups: rows
  };
}
function normalizedReportCatalogConfiguration() {
  const configuredFields = new Map(reportCatalogConfiguration.fields.map((field) => [field.key, field]));
  const configuredMetrics = new Map(reportCatalogConfiguration.metrics.map((metric) => [metric.key, metric]));
  return {
    ...reportCatalogConfiguration,
    fields: REPORT_FIELD_CATALOG.map((base, index) => {
      const configured = configuredFields.get(base.key);
      return {
        ...base,
        label: configured?.label || base.label,
        isActive: configured?.isActive ?? true,
        groupable: base.groupable && (configured?.groupable ?? base.groupable),
        exportable: base.exportable && (configured?.exportable ?? base.exportable),
        defaultExport: configured?.defaultExport ?? DEFAULT_REPORT_EXPORT_FIELDS.has(base.key),
        sortOrder: configured?.sortOrder ?? index
      };
    }).sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, "vi-VN")),
    metrics: REPORT_METRIC_CATALOG.map((base, index) => {
      const configured = configuredMetrics.get(base.key);
      return {
        ...base,
        label: configured?.label || base.label,
        isActive: configured?.isActive ?? DEFAULT_REPORT_METRICS.has(base.key),
        sortOrder: configured?.sortOrder ?? index
      };
    }).sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, "vi-VN"))
  };
}
function buildReportCatalog(items) {
  const configuration = normalizedReportCatalogConfiguration();
  const fields = configuration.fields.filter((field) => field.isActive).map((field) => {
    if (field.valueType !== "ENUM") return { ...field };
    const options = /* @__PURE__ */ new Map();
    for (const finding of items) {
      const value = reportFieldAccessors[field.key](finding);
      const key = String(value);
      options.set(key, reportValueLabel(field.key, value, finding));
    }
    return {
      ...field,
      options: [...options.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "vi-VN"))
    };
  });
  return {
    version: "report-keys.v1",
    fields,
    operators: REPORT_OPERATOR_CATALOG,
    metrics: configuration.metrics.filter((metric) => metric.isActive)
  };
}
function assertReportConfigurationAvailable(query, columns) {
  const configuration = normalizedReportCatalogConfiguration();
  const fields = new Map(configuration.fields.map((field) => [field.key, field]));
  const metrics = new Map(configuration.metrics.map((metric) => [metric.key, metric]));
  const unavailableRule = query.rules.find((rule) => !fields.get(rule.key)?.isActive);
  if (unavailableRule) {
    throw new HttpProblem(422, "REPORT_FIELD_DISABLED", "Tr\u01B0\u1EDDng b\xE1o c\xE1o \u0111\xE3 t\u1EAFt", "B\u1ED9 l\u1ECDc \u0111ang d\xF9ng m\u1ED9t tr\u01B0\u1EDDng kh\xF4ng c\xF2n \u0111\u01B0\u1EE3c qu\u1EA3n tr\u1ECB vi\xEAn cho ph\xE9p.");
  }
  const groupField = fields.get(query.groupBy);
  if (!groupField?.isActive || !groupField.groupable) {
    throw new HttpProblem(422, "REPORT_GROUP_DISABLED", "C\xE1ch xem kh\xF4ng c\xF2n \xE1p d\u1EE5ng", "Tr\u01B0\u1EDDng ph\xE2n nh\xF3m kh\xF4ng c\xF2n \u0111\u01B0\u1EE3c qu\u1EA3n tr\u1ECB vi\xEAn cho ph\xE9p.");
  }
  if (query.metrics.some((key) => !metrics.get(key)?.isActive)) {
    throw new HttpProblem(422, "REPORT_METRIC_DISABLED", "Ch\u1EC9 s\u1ED1 b\xE1o c\xE1o \u0111\xE3 t\u1EAFt", "B\xE1o c\xE1o \u0111ang d\xF9ng m\u1ED9t ch\u1EC9 s\u1ED1 kh\xF4ng c\xF2n \u0111\u01B0\u1EE3c qu\u1EA3n tr\u1ECB vi\xEAn cho ph\xE9p.");
  }
  if (columns?.some((key) => {
    const field = fields.get(key);
    return !field?.isActive || !field.exportable;
  })) {
    throw new HttpProblem(422, "REPORT_EXPORT_FIELD_DISABLED", "C\u1ED9t xu\u1EA5t \u0111\xE3 t\u1EAFt", "B\xE1o c\xE1o \u0111ang d\xF9ng m\u1ED9t c\u1ED9t kh\xF4ng c\xF2n \u0111\u01B0\u1EE3c qu\u1EA3n tr\u1ECB vi\xEAn cho ph\xE9p xu\u1EA5t.");
  }
}
function applyReportFilters(items, filters) {
  return items.filter((finding) => {
    if (filters.branchCode && finding.branchCode !== filters.branchCode) return false;
    if (filters.department && finding.department !== filters.department) return false;
    if (filters.workflowStatus && finding.workflowStatus !== filters.workflowStatus) return false;
    if (filters.errorCode && !finding.errorCode.toLocaleLowerCase("vi-VN").includes(filters.errorCode.toLocaleLowerCase("vi-VN"))) return false;
    const findingDate = finding.auditDate || finding.createdAt.slice(0, 10);
    if (filters.dateFrom && findingDate < filters.dateFrom) return false;
    if (filters.dateTo && findingDate > filters.dateTo) return false;
    return true;
  });
}
function idempotencyContext(request, user, body) {
  const rawKey = request.headers["idempotency-key"];
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  if (!key) {
    throw new HttpProblem(422, "IDEMPOTENCY_KEY_REQUIRED", "Thi\u1EBFu Idempotency-Key", "M\u1ECDi l\u1EC7nh thay \u0111\u1ED5i tr\u1EA1ng th\xE1i ph\u1EA3i c\xF3 Idempotency-Key \u0111\u1EC3 ch\u1ED1ng x\u1EED l\xFD l\u1EB7p.");
  }
  if (key.length > 255) {
    throw new HttpProblem(422, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key kh\xF4ng h\u1EE3p l\u1EC7", "Idempotency-Key kh\xF4ng \u0111\u01B0\u1EE3c d\xE0i qu\xE1 255 k\xFD t\u1EF1.");
  }
  const cacheKey = `${user.id}:${request.method}:${request.url}:${key}`;
  const requestHash = crypto5.createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const existing = idempotencyRecords[cacheKey];
  if (existing && existing.requestHash !== requestHash) {
    throw new HttpProblem(409, "IDEMPOTENCY_CONFLICT", "Xung \u0111\u1ED9t Idempotency-Key", "Idempotency-Key \u0111\xE3 \u0111\u01B0\u1EE3c d\xF9ng v\u1EDBi n\u1ED9i dung y\xEAu c\u1EA7u kh\xE1c.");
  }
  return {
    cacheKey,
    requestHash,
    replay: existing ? structuredClone(existing.response) : void 0
  };
}
function rememberIdempotentResponse(context, response) {
  if (context.cacheKey && context.requestHash) {
    idempotencyRecords[context.cacheKey] = {
      requestHash: context.requestHash,
      response: structuredClone(response)
    };
  }
}
app.get("/api/v1/health", async () => ({ status: "UP", timestamp: (/* @__PURE__ */ new Date()).toISOString() }));
var REDACTED_DIAGNOSTIC = "Chi ti\u1EBFt l\u1ED7i ch\u1EC9 hi\u1EC3n th\u1ECB cho qu\u1EA3n tr\u1ECB vi\xEAn \u0111\xE3 \u0111\u0103ng nh\u1EADp.";
function buildReadinessPayload(dataStore, evidenceStorage, options = {}) {
  const includeDiagnostics = options.includeDiagnostics ?? false;
  const diagnostic = (warning, fallback) => includeDiagnostics ? warning ?? fallback : REDACTED_DIAGNOSTIC;
  const postgresUnavailable = dataStore.mode === "postgres" && !dataStore.ready;
  const dataStoreMessage = dataStore.mode === "postgres" ? postgresUnavailable ? `Postgres kh\xF4ng s\u1EB5n s\xE0ng. ${diagnostic(dataStore.warning, "Kh\xF4ng th\u1EC3 x\xE1c nh\u1EADn k\u1EBFt n\u1ED1i database.")}` : "Postgres \u0111\xE3 k\u1EBFt n\u1ED1i; state \u0111ang l\u01B0u b\u1EC1n v\u1EEFng ngo\xE0i filesystem serverless." : dataStore.durable ? "Local mode \u0111ang l\u01B0u tr\u1EA1ng th\xE1i b\u1EC1n v\u1EEFng b\u1EB1ng JSON nguy\xEAn t\u1EED." : "Local mode \u0111ang ch\u1EA1y b\u1EB1ng b\u1ED9 nh\u1EDB; d\u1EEF li\u1EC7u s\u1EBD m\u1EA5t khi ti\u1EBFn tr\xECnh d\u1EEBng.";
  const evidenceMessage = evidenceStorage.ready ? "" : evidenceStorage.mode === "google-drive" ? ` Google Drive ch\u01B0a s\u1EB5n s\xE0ng. ${diagnostic(evidenceStorage.warning, "Adapter API v3 ch\u01B0a \u0111\u01B0\u1EE3c c\xE0i \u0111\u1EB7t.")} H\u1EC7 th\u1ED1ng kh\xF4ng fallback local.` : ` Ch\u1EBF \u0111\u1ED9 l\u01B0u minh ch\u1EE9ng kh\xF4ng h\u1EE3p l\u1EC7. ${diagnostic(evidenceStorage.warning, "C\u1EA7n c\u1EA5u h\xECnh EVIDENCE_STORAGE_MODE h\u1EE3p l\u1EC7.")} H\u1EC7 th\u1ED1ng kh\xF4ng fallback local.`;
  const ready = !postgresUnavailable && evidenceStorage.ready;
  const message = `${dataStoreMessage}${evidenceMessage} Ch\u01B0a ph\u1EA3i tr\u1EA1ng th\xE1i production-ready.`;
  const redactedDataStore = includeDiagnostics || !("warning" in dataStore) || dataStore.warning === void 0 ? dataStore : { ...dataStore, warning: REDACTED_DIAGNOSTIC };
  const redactedEvidenceStorage = includeDiagnostics || evidenceStorage.warning === void 0 ? evidenceStorage : { ...evidenceStorage, warning: REDACTED_DIAGNOSTIC };
  return {
    status: "DEGRADED",
    ready,
    checks: {
      dataStore: redactedDataStore,
      evidenceStorage: redactedEvidenceStorage,
      auth: { mode: "local-credential-session", productionSafe: false }
    },
    message
  };
}
function optionalAdminViewer(request) {
  const session = authSessionStore.resolve(cookieValue(request, "audit_bgs_session") ?? "");
  if (!session) return void 0;
  const user = appUsers.find((item) => item.id === session.userId && item.isActive);
  return user?.roles.includes("ADMIN") ? user : void 0;
}
app.get("/api/v1/ready", async (req) => buildReadinessPayload(
  await stateRepository.getStatus(),
  await googleDriveService.getStorageStatus(),
  { includeDiagnostics: Boolean(optionalAdminViewer(req)) }
));
function requireCronAuthorization(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new HttpProblem(503, "CRON_NOT_CONFIGURED", "Cron SLA ch\u01B0a \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh", "M\xE1y ch\u1EE7 ch\u01B0a c\xF3 CRON_SECRET.");
  }
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const received = Buffer.from(request.headers.authorization ?? "", "utf8");
  const authorized = expected.length === received.length && crypto5.timingSafeEqual(expected, received);
  if (!authorized) {
    throw new HttpProblem(401, "CRON_AUTH_REQUIRED", "Kh\xF4ng th\u1EC3 x\xE1c th\u1EF1c cron", "Authorization Bearer kh\xF4ng h\u1EE3p l\u1EC7.");
  }
}
app.route({
  method: ["GET", "POST"],
  url: internalSlaPath,
  handler: async (request) => {
    requireCronAuthorization(request);
    const dataStore = await stateRepository.getStatus();
    if ("ready" in dataStore && !dataStore.ready) {
      throw new HttpProblem(503, "CRON_DATABASE_UNAVAILABLE", "Database ch\u01B0a s\u1EB5n s\xE0ng", dataStore.warning ?? "Cron kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i PostgreSQL.");
    }
    return {
      success: true,
      maintenance: {
        databaseActivity: true,
        dataStore: { mode: dataStore.mode, durable: dataStore.durable }
      },
      ...await evaluateCurrentSlaState()
    };
  }
});
app.get("/api/v1/integrations/google-drive/connect", async (req, reply) => {
  const user = getCurrentUser(req);
  requireAdmin(user);
  const state = createGoogleDriveOAuthState({ userId: user.id, secret: googleOAuthStateSecret() });
  return reply.redirect(googleDriveService.createOAuthAuthorizationUrl(state));
});
app.get("/api/v1/integrations/google-drive/callback", async (req, reply) => {
  const user = getCurrentUser(req);
  requireAdmin(user);
  if (req.query.error) throw new HttpProblem(422, "GOOGLE_OAUTH_DENIED", "K\u1EBFt n\u1ED1i Google Drive b\u1ECB t\u1EEB ch\u1ED1i", "T\xE0i kho\u1EA3n Google kh\xF4ng ch\u1EA5p thu\u1EADn quy\u1EC1n truy c\u1EADp Drive.");
  if (!req.query.code || !req.query.state) throw new HttpProblem(422, "GOOGLE_OAUTH_CALLBACK_INVALID", "OAuth callback kh\xF4ng h\u1EE3p l\u1EC7", "Google kh\xF4ng tr\u1EA3 authorization code ho\u1EB7c state.");
  const state = verifyGoogleDriveOAuthState({ state: req.query.state, secret: googleOAuthStateSecret() });
  if (state.userId !== user.id) throw new HttpProblem(403, "GOOGLE_OAUTH_STATE_USER_MISMATCH", "OAuth callback kh\xF4ng h\u1EE3p l\u1EC7", "K\u1EBFt n\u1ED1i Google Drive ph\u1EA3i \u0111\u01B0\u1EE3c ho\xE0n t\u1EA5t b\u1EDFi \u0111\xFAng qu\u1EA3n tr\u1ECB vi\xEAn \u0111\xE3 b\u1EAFt \u0111\u1EA7u.");
  const refreshToken = await googleDriveService.exchangeOAuthCode(req.query.code);
  try {
    googleDriveOAuthCredential = {
      encryptedRefreshToken: encryptGoogleDriveRefreshToken(refreshToken, googleOAuthEncryptionKey()),
      connectedByUserId: user.id,
      connectedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  } catch {
    googleDriveService.setOAuthRefreshToken(void 0);
    throw new HttpProblem(503, "GOOGLE_OAUTH_TOKEN_STORAGE_FAILED", "Kh\xF4ng th\u1EC3 l\u01B0u k\u1EBFt n\u1ED1i Google Drive", "Ki\u1EC3m tra GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY r\u1ED3i k\u1EBFt n\u1ED1i l\u1EA1i.");
  }
  recordUserSecurityEvent(req, user, {
    type: "ADMIN_GOOGLE_DRIVE_CONNECTED",
    outcome: "SUCCESS",
    detail: "\u0110\u1EA5u n\u1ED1i Google Drive c\xE1 nh\xE2n l\xE0m kho minh ch\u1EE9ng."
  });
  await persistLocalState();
  return reply.type("text/html; charset=utf-8").send('<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Google Drive \u0111\xE3 k\u1EBFt n\u1ED1i</title></head><body><p>\u0110\xE3 k\u1EBFt n\u1ED1i Google Drive c\xE1 nh\xE2n. B\u1EA1n c\xF3 th\u1EC3 \u0111\xF3ng c\u1EEDa s\u1ED5 n\xE0y v\xE0 quay l\u1EA1i AuditBGS.</p></body></html>');
});
app.get("/api/v1/auth/google", async (req, reply) => {
  if (process.env.AUTH_MODE !== "oidc") {
    throw new HttpProblem(404, "OIDC_NOT_ENABLED", "\u0110\u0103ng nh\u1EADp Google ch\u01B0a \u0111\u01B0\u1EE3c b\u1EADt", "M\xE1y ch\u1EE7 hi\u1EC7n kh\xF4ng d\xF9ng Google OIDC.");
  }
  try {
    return reply.redirect(createAuthorizationUrl({ returnTo: req.query.returnTo ?? "/" }));
  } catch {
    throw new HttpProblem(503, "OIDC_NOT_CONFIGURED", "\u0110\u0103ng nh\u1EADp Google ch\u01B0a s\u1EB5n s\xE0ng", "Qu\u1EA3n tr\u1ECB vi\xEAn c\u1EA7n ho\xE0n t\u1EA5t c\u1EA5u h\xECnh Google OIDC tr\xEAn m\xE1y ch\u1EE7.");
  }
});
app.get("/api/v1/auth/google/callback", async (req, reply) => {
  if (process.env.AUTH_MODE !== "oidc") throw new HttpProblem(404, "OIDC_NOT_ENABLED", "\u0110\u0103ng nh\u1EADp Google ch\u01B0a \u0111\u01B0\u1EE3c b\u1EADt", "M\xE1y ch\u1EE7 hi\u1EC7n kh\xF4ng d\xF9ng Google OIDC.");
  if (req.query.error) throw new HttpProblem(401, "GOOGLE_OIDC_DENIED", "\u0110\u0103ng nh\u1EADp Google b\u1ECB t\u1EEB ch\u1ED1i", "T\xE0i kho\u1EA3n Google kh\xF4ng ch\u1EA5p thu\u1EADn y\xEAu c\u1EA7u \u0111\u0103ng nh\u1EADp.");
  if (!req.query.code || !req.query.state) throw new HttpProblem(422, "GOOGLE_OIDC_CALLBACK_INVALID", "Callback Google kh\xF4ng h\u1EE3p l\u1EC7", "Google kh\xF4ng tr\u1EA3 authorization code ho\u1EB7c state.");
  let oidc;
  try {
    oidc = await exchangeCode({ code: req.query.code, state: req.query.state });
  } catch {
    throw new HttpProblem(401, "GOOGLE_OIDC_INVALID", "Kh\xF4ng th\u1EC3 x\xE1c th\u1EF1c Google", "Phi\xEAn \u0111\u0103ng nh\u1EADp Google kh\xF4ng h\u1EE3p l\u1EC7 ho\u1EB7c \u0111\xE3 h\u1EBFt h\u1EA1n.");
  }
  const email = oidc.identity.email;
  const user = appUsers.find((candidate) => candidate.isActive && [candidate.email, candidate.googleWorkspaceEmail].some((candidateEmail) => candidateEmail?.toLocaleLowerCase("en-US") === email));
  if (!user) {
    recordSecurityEvent({
      type: "AUTH_OIDC_LOGIN_REJECTED",
      outcome: "FAILURE",
      subject: email,
      detail: "Email Google \u0111\xE3 x\xE1c th\u1EF1c nh\u01B0ng ch\u01B0a \u0111\u01B0\u1EE3c c\u1EA5p t\xE0i kho\u1EA3n trong h\u1EC7 th\u1ED1ng.",
      ipAddress: req.ip
    });
    await persistLocalState();
    throw new HttpProblem(403, "GOOGLE_OIDC_USER_NOT_PROVISIONED", "T\xE0i kho\u1EA3n Google ch\u01B0a \u0111\u01B0\u1EE3c c\u1EA5p quy\u1EC1n", "Qu\u1EA3n tr\u1ECB vi\xEAn c\u1EA7n t\u1EA1o user v\xE0 g\xE1n role cho email Google n\xE0y tr\u01B0\u1EDBc.");
  }
  recordUserSecurityEvent(req, user, {
    type: "AUTH_OIDC_LOGIN_SUCCEEDED",
    outcome: "SUCCESS",
    subject: email,
    detail: "\u0110\u0103ng nh\u1EADp b\u1EB1ng Google OIDC."
  });
  await createAuthenticatedSession(user, reply);
  return reply.redirect(oidc.returnTo);
});
app.post("/api/v1/auth/login", async (req, reply) => {
  if (process.env.AUTH_MODE === "oidc") {
    throw new HttpProblem(405, "OIDC_LOGIN_REQUIRED", "H\xE3y \u0111\u0103ng nh\u1EADp b\u1EB1ng Google", "M\xF4i tr\u01B0\u1EDDng n\xE0y ch\u1EC9 ch\u1EA5p nh\u1EADn Google OIDC.");
  }
  const nowMs = Date.now();
  assertLoginBurstAllowed(nowMs);
  const credentials = LoginSchema.parse(req.body);
  const normalizedUsername = credentials.username.toLocaleLowerCase("vi-VN");
  pruneLoginAttempts(nowMs);
  try {
    assertLoginNotLocked(normalizedUsername, nowMs);
  } catch (error) {
    recordSecurityEvent({
      type: "AUTH_LOGIN_THROTTLED",
      outcome: "FAILURE",
      subject: normalizedUsername,
      detail: "T\u1EEB ch\u1ED1i \u0111\u0103ng nh\u1EADp v\xEC t\xEAn \u0111\u0103ng nh\u1EADp \u0111ang b\u1ECB kho\xE1 t\u1EA1m th\u1EDDi.",
      ipAddress: req.ip
    });
    await persistLocalState();
    throw error;
  }
  const directoryEntry = credentialDirectory.find((item) => item.username === normalizedUsername);
  const passwordValid = await verifyPassword(credentials.password, directoryEntry?.passwordHash ?? unknownUserPasswordHash);
  const user = directoryEntry ? appUsers.find((item) => item.id === directoryEntry.userId && item.isActive) : void 0;
  if (!passwordValid || !user) {
    const { locked } = recordLoginFailure(normalizedUsername, nowMs);
    recordSecurityEvent({
      type: "AUTH_LOGIN_FAILED",
      outcome: "FAILURE",
      subject: normalizedUsername,
      detail: locked ? `Sai m\u1EADt kh\u1EA9u; \u0111\xE3 kho\xE1 t\u1EA1m th\u1EDDi ${LOGIN_LOCKOUT_MS / 6e4} ph\xFAt sau ${LOGIN_FAILURE_LIMIT} l\u1EA7n sai.` : "T\xE0i kho\u1EA3n ho\u1EB7c m\u1EADt kh\u1EA9u kh\xF4ng \u0111\xFAng.",
      ipAddress: req.ip
    });
    await persistLocalState();
    throw new HttpProblem(401, "INVALID_CREDENTIALS", "\u0110\u0103ng nh\u1EADp kh\xF4ng th\xE0nh c\xF4ng", "T\xE0i kho\u1EA3n ho\u1EB7c m\u1EADt kh\u1EA9u kh\xF4ng \u0111\xFAng.");
  }
  clearLoginFailures(normalizedUsername);
  recordSecurityEvent({
    type: "AUTH_LOGIN_SUCCEEDED",
    outcome: "SUCCESS",
    actorUserId: user.id,
    actorName: user.fullName,
    actorRole: user.primaryRole,
    subject: normalizedUsername,
    detail: "\u0110\u0103ng nh\u1EADp b\u1EB1ng t\xEAn \u0111\u0103ng nh\u1EADp v\xE0 m\u1EADt kh\u1EA9u.",
    ipAddress: req.ip
  });
  const expiresAt = await createAuthenticatedSession(user, reply);
  return { user, expiresAt };
});
app.post("/api/v1/auth/logout", async (req, reply) => {
  const token = cookieValue(req, "audit_bgs_session");
  const endingSession = token ? authSessionStore.resolve(token) : void 0;
  if (token) authSessionStore.revoke(token);
  if (endingSession) {
    const owner = appUsers.find((item) => item.id === endingSession.userId);
    recordSecurityEvent({
      type: "AUTH_LOGOUT",
      outcome: "SUCCESS",
      actorUserId: endingSession.userId,
      actorName: owner?.fullName,
      actorRole: owner?.primaryRole,
      detail: "K\u1EBFt th\xFAc phi\xEAn \u0111\u0103ng nh\u1EADp.",
      ipAddress: req.ip
    });
  }
  authSessions = authSessionStore.records();
  await persistLocalState();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  reply.header("set-cookie", `audit_bgs_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  return reply.code(204).send();
});
app.get("/api/v1/me", async (req) => {
  const user = getCurrentUser(req);
  return { user };
});
app.get("/api/v1/campaigns", async (req) => {
  const user = getCurrentUser(req);
  return auditCampaigns.filter((campaign) => canAccessCampaign(user, campaign));
});
app.post("/api/v1/admin/campaigns", async (req, reply) => {
  const user = getCurrentUser(req);
  requireAdmin(user);
  const body = CreateAuditCampaignSchema.parse(req.body);
  if (auditCampaigns.some((item) => item.code.toLocaleLowerCase("vi-VN") === body.code.toLocaleLowerCase("vi-VN"))) {
    throw new HttpProblem(409, "CAMPAIGN_CODE_EXISTS", "M\xE3 chuy\xEAn \u0111\u1EC1 \u0111\xE3 t\u1ED3n t\u1EA1i", "H\xE3y s\u1EED d\u1EE5ng m\xE3 chuy\xEAn \u0111\u1EC1 kh\xE1c.");
  }
  if (!appUsers.some((item) => item.id === body.leadUserId && item.isActive)) throw new HttpProblem(422, "CAMPAIGN_LEAD_INVALID", "Tr\u01B0\u1EDFng \u0111o\xE0n kh\xF4ng h\u1EE3p l\u1EC7", "T\xE0i kho\u1EA3n tr\u01B0\u1EDFng \u0111o\xE0n kh\xF4ng t\u1ED3n t\u1EA1i ho\u1EB7c \u0111\xE3 b\u1ECB kh\xF3a.");
  if (body.members.some((member) => !appUsers.some((item) => item.id === member.userId && item.isActive))) throw new HttpProblem(422, "CAMPAIGN_MEMBER_INVALID", "Th\xE0nh vi\xEAn kh\xF4ng h\u1EE3p l\u1EC7", "Danh s\xE1ch c\xF3 t\xE0i kho\u1EA3n kh\xF4ng t\u1ED3n t\u1EA1i ho\u1EB7c \u0111\xE3 b\u1ECB kh\xF3a.");
  if (body.reportChannelIds.some((id) => !reportChannels.some((channel) => channel.id === id && channel.isActive))) throw new HttpProblem(422, "CAMPAIGN_CHANNEL_INVALID", "Lo\u1EA1i b\xE1o c\xE1o kh\xF4ng h\u1EE3p l\u1EC7", "Danh s\xE1ch c\xF3 lo\u1EA1i b\xE1o c\xE1o kh\xF4ng ho\u1EA1t \u0111\u1ED9ng.");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const campaign = {
    ...body,
    id: `campaign-${crypto5.randomUUID()}`,
    status: "DRAFT",
    driveProvisionStatus: "NOT_CONFIGURED",
    version: 1,
    createdByUserId: user.id,
    createdAt: now,
    updatedAt: now
  };
  auditCampaigns.push(campaign);
  await persistLocalState();
  return reply.code(201).send(campaign);
});
app.patch("/api/v1/admin/campaigns/:id", async (req) => {
  const user = getCurrentUser(req);
  requireAdmin(user);
  const body = UpdateAuditCampaignSchema.parse(req.body);
  const index = auditCampaigns.findIndex((item) => item.id === req.params.id);
  if (index < 0) throw new HttpProblem(404, "CAMPAIGN_NOT_FOUND", "Kh\xF4ng t\xECm th\u1EA5y chuy\xEAn \u0111\u1EC1", "Chuy\xEAn \u0111\u1EC1 kh\xF4ng t\u1ED3n t\u1EA1i.");
  const current = auditCampaigns[index];
  if (current.version !== body.expectedVersion) throw new HttpProblem(409, "CAMPAIGN_VERSION_CONFLICT", "Chuy\xEAn \u0111\u1EC1 \u0111\xE3 thay \u0111\u1ED5i", "H\xE3y t\u1EA3i l\u1EA1i d\u1EEF li\u1EC7u tr\u01B0\u1EDBc khi l\u01B0u.");
  if (body.status) {
    try {
      validateCampaignTransition(current.status, body.status);
    } catch {
      throw new HttpProblem(409, "CAMPAIGN_TRANSITION_INVALID", "Kh\xF4ng th\u1EC3 \u0111\u1ED5i tr\u1EA1ng th\xE1i", "Chuy\xEAn \u0111\u1EC1 ph\u1EA3i \u0111\xF3ng tr\u01B0\u1EDBc khi l\u01B0u tr\u1EEF.");
    }
  }
  const { expectedVersion: _expectedVersion, ...changes } = body;
  auditCampaigns[index] = { ...current, ...changes, version: current.version + 1, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  await persistLocalState();
  return auditCampaigns[index];
});
app.delete("/api/v1/admin/campaigns/:id", async (req, reply) => {
  requireAdmin(getCurrentUser(req));
  const index = auditCampaigns.findIndex((item) => item.id === req.params.id);
  if (index < 0) throw new HttpProblem(404, "CAMPAIGN_NOT_FOUND", "Kh\xF4ng t\xECm th\u1EA5y chuy\xEAn \u0111\u1EC1", "Chuy\xEAn \u0111\u1EC1 kh\xF4ng t\u1ED3n t\u1EA1i.");
  const campaign = auditCampaigns[index];
  if (campaign.status !== "DRAFT") {
    throw new HttpProblem(409, "CAMPAIGN_DELETE_REQUIRES_DRAFT", "Ch\u01B0a th\u1EC3 x\xF3a chuy\xEAn \u0111\u1EC1", "Ch\u1EC9 c\xF3 th\u1EC3 x\xF3a chuy\xEAn \u0111\u1EC1 \u1EDF tr\u1EA1ng th\xE1i nh\xE1p. H\xE3y \u0111\xF3ng v\xE0 l\u01B0u tr\u1EEF chuy\xEAn \u0111\u1EC1 \u0111\xE3 v\u1EADn h\xE0nh.");
  }
  if (findings.some((finding) => finding.campaignId === campaign.id)) {
    throw new HttpProblem(409, "CAMPAIGN_HAS_FINDINGS", "Ch\u01B0a th\u1EC3 x\xF3a chuy\xEAn \u0111\u1EC1", "Chuy\xEAn \u0111\u1EC1 \u0111\xE3 c\xF3 h\u1ED3 s\u01A1 li\xEAn quan n\xEAn kh\xF4ng \u0111\u01B0\u1EE3c x\xF3a \u0111\u1EC3 b\u1EA3o to\xE0n l\u1ECBch s\u1EED.");
  }
  auditCampaigns.splice(index, 1);
  await persistLocalState();
  return reply.code(204).send();
});
app.post("/api/v1/admin/campaigns/import-draft", async (req, reply) => {
  requireAdmin(getCurrentUser(req));
  const data = await req.file();
  if (!data) throw new HttpProblem(422, "CAMPAIGN_IMPORT_FILE_REQUIRED", "Thi\u1EBFu t\u1EC7p chuy\xEAn \u0111\u1EC1", "H\xE3y t\u1EA3i l\xEAn m\u1ED9t t\u1EC7p DOCX, PDF ho\u1EB7c Excel.");
  const buffer = await data.toBuffer();
  try {
    return reply.send(await extractCampaignImportDraft(data.filename, buffer));
  } catch (error) {
    if (error instanceof CampaignDocumentImportError) {
      throw new HttpProblem(422, "CAMPAIGN_IMPORT_UNREADABLE", "Kh\xF4ng th\u1EC3 b\xF3c t\xE1ch t\u1EC7p chuy\xEAn \u0111\u1EC1", error.message);
    }
    throw error;
  }
});
app.post("/api/v1/admin/campaigns/:id/provision-drive", async (req) => {
  const user = getCurrentUser(req);
  requireAdmin(user);
  const index = auditCampaigns.findIndex((item) => item.id === req.params.id);
  if (index < 0) throw new HttpProblem(404, "CAMPAIGN_NOT_FOUND", "Kh\xF4ng t\xECm th\u1EA5y chuy\xEAn \u0111\u1EC1", "Chuy\xEAn \u0111\u1EC1 kh\xF4ng t\u1ED3n t\u1EA1i.");
  if (!appsScriptDriveGateway.isConfigured()) {
    throw new HttpProblem(503, "DRIVE_NOT_CONFIGURED", "Google Drive ch\u01B0a \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh", "Qu\u1EA3n tr\u1ECB vi\xEAn c\u1EA7n khai b\xE1o URL Apps Script v\xE0 kh\xF3a b\xED m\u1EADt tr\u01B0\u1EDBc khi t\u1EA1o kho d\u1EEF li\u1EC7u.");
  }
  const campaign = auditCampaigns[index];
  const aclByEmail = /* @__PURE__ */ new Map();
  const grant = (candidate, access) => {
    const email = (candidate.googleWorkspaceEmail ?? candidate.email).trim().toLowerCase();
    if (!email) return;
    const current = aclByEmail.get(email);
    if (current !== "WRITER") aclByEmail.set(email, access);
  };
  for (const member of campaign.members) {
    const candidate = appUsers.find((item) => item.id === member.userId && item.isActive);
    if (candidate) grant(candidate, "WRITER");
  }
  for (const candidate of appUsers.filter((item) => item.isActive && item.branchCode && campaign.branchCodes.includes(item.branchCode))) {
    grant(candidate, candidate.roles.includes("BRANCH_INPUT") ? "WRITER" : "READER");
  }
  for (const candidate of appUsers.filter((item) => item.isActive && item.roles.includes("ADMIN"))) grant(candidate, "WRITER");
  auditCampaigns[index] = {
    ...campaign,
    driveProvisionStatus: "PROVISIONING",
    driveLastError: void 0,
    version: campaign.version + 1,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await persistLocalState();
  try {
    const provisioned = await appsScriptDriveGateway.execute("PROVISION_CAMPAIGN", {
      campaignId: campaign.id,
      campaignCode: campaign.code,
      campaignName: campaign.name,
      decisionNo: campaign.decisionNo
    });
    if (!provisioned.data.folderId || !provisioned.data.folderUrl) {
      throw new HttpProblem(502, "DRIVE_FOLDER_RESPONSE_INVALID", "Kh\xF4ng th\u1EC3 t\u1EA1o kho Google Drive", "Apps Script kh\xF4ng tr\u1EA3 v\u1EC1 ID th\u01B0 m\u1EE5c chuy\xEAn \u0111\u1EC1.");
    }
    await appsScriptDriveGateway.execute("SYNC_CAMPAIGN_ACL", {
      campaignId: campaign.id,
      campaignFolderId: provisioned.data.folderId,
      members: [...aclByEmail.entries()].map(([email, access]) => ({ email, access }))
    });
    auditCampaigns[index] = {
      ...auditCampaigns[index],
      driveRootFolderId: provisioned.data.folderId,
      driveRootUrl: provisioned.data.folderUrl,
      driveProvisionStatus: "READY",
      driveLastError: void 0,
      version: auditCampaigns[index].version + 1,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await persistLocalState();
    return auditCampaigns[index];
  } catch (error) {
    auditCampaigns[index] = {
      ...auditCampaigns[index],
      driveProvisionStatus: "FAILED",
      driveLastError: error instanceof Error ? error.message : "Kh\xF4ng th\u1EC3 t\u1EA1o kho d\u1EEF li\u1EC7u.",
      version: auditCampaigns[index].version + 1,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await persistLocalState();
    throw error;
  }
});
app.get("/api/v1/org-units/branches", async (req) => {
  const user = getCurrentUser(req);
  const seesEverything = user.scopes.some((scope) => scope.scopeType === "ALL");
  const scopedBranchCodes = new Set(user.scopes.flatMap((scope) => scope.orgUnitCode ? [scope.orgUnitCode] : []));
  const scopedClusters = new Set(user.scopes.flatMap((scope) => scope.clusterName ? [scope.clusterName] : []));
  return orgUnits.filter((unit) => unit.type === "BRANCH" && unit.isActive).map((unit) => ({ ...unit, parentName: orgUnits.find((candidate) => candidate.id === unit.parentId)?.name })).filter((unit) => seesEverything || scopedBranchCodes.has(unit.code) || (unit.parentName ? scopedClusters.has(unit.parentName) : false) || unit.code === user.branchCode);
});
app.get("/api/v1/admin/org-units", async (req) => {
  requireAdmin(getCurrentUser(req));
  return orgUnits.map(projectOrgUnit);
});
function projectOrgUnit(unit) {
  const parent = orgUnits.find((candidate) => candidate.id === unit.parentId);
  const leader = appUsers.find((candidate) => candidate.id === unit.leaderUserId);
  return { ...unit, parentName: parent?.name, leaderName: leader?.fullName ?? unit.leaderName };
}
function assertOrgUnitParent(type, parentId, ownId) {
  const expectedParentType = {
    INTERNAL_TEAM: "HEAD_OFFICE",
    CLUSTER: "HEAD_OFFICE",
    BRANCH: "CLUSTER",
    DEPARTMENT: "BRANCH"
  };
  if (type === "HEAD_OFFICE") {
    if (parentId) throw new HttpProblem(422, "ORG_PARENT_INVALID", "\u0110\u01A1n v\u1ECB cha kh\xF4ng h\u1EE3p l\u1EC7", "H\u1ED9i s\u1EDF kh\xF4ng \u0111\u01B0\u1EE3c tr\u1EF1c thu\u1ED9c \u0111\u01A1n v\u1ECB kh\xE1c.");
    return;
  }
  const parent = orgUnits.find((unit) => unit.id === parentId);
  const requiredType = expectedParentType[type];
  if (!parent || parent.id === ownId || parent.type !== requiredType) {
    throw new HttpProblem(422, "ORG_PARENT_INVALID", "\u0110\u01A1n v\u1ECB cha kh\xF4ng h\u1EE3p l\u1EC7", `${type} ph\u1EA3i tr\u1EF1c thu\u1ED9c ${requiredType}.`);
  }
}
function assertOrgUnitLeader(leaderUserId) {
  if (leaderUserId && !appUsers.some((user) => user.id === leaderUserId && user.isActive)) {
    throw new HttpProblem(422, "ORG_LEADER_INVALID", "Ng\u01B0\u1EDDi ph\u1EE5 tr\xE1ch kh\xF4ng h\u1EE3p l\u1EC7", "Ng\u01B0\u1EDDi ph\u1EE5 tr\xE1ch ph\u1EA3i l\xE0 t\xE0i kho\u1EA3n \u0111ang ho\u1EA1t \u0111\u1ED9ng.");
  }
}
function dependentOrgUnitReferences(unit) {
  const references = [];
  if (orgUnits.some((candidate) => candidate.parentId === unit.id)) references.push("\u0111\u01A1n v\u1ECB con");
  if (appUsers.some((user) => user.orgUnitId === unit.id || user.internalTeamId === unit.id || user.branchCode === unit.code)) references.push("ng\u01B0\u1EDDi d\xF9ng \u0111ang ph\xE2n c\xF4ng");
  if (findings.some((finding) => finding.branchCode === unit.code)) references.push("h\u1ED3 s\u01A1 l\u1ECBch s\u1EED");
  if (auditCampaigns.some((campaign) => campaign.branchCodes.includes(unit.code))) references.push("chuy\xEAn \u0111\u1EC1 \u0111ang tham chi\u1EBFu");
  return references;
}
app.post("/api/v1/admin/org-units", async (req) => {
  requireAdmin(getCurrentUser(req));
  const body = CreateOrgUnitSchema.parse(req.body);
  if (orgUnits.some((unit) => unit.code.toLowerCase() === body.code.toLowerCase())) {
    throw new HttpProblem(409, "ORG_UNIT_CODE_EXISTS", "M\xE3 \u0111\u01A1n v\u1ECB \u0111\xE3 t\u1ED3n t\u1EA1i", "Vui l\xF2ng s\u1EED d\u1EE5ng m\u1ED9t m\xE3 \u0111\u01A1n v\u1ECB kh\xE1c.");
  }
  assertOrgUnitParent(body.type, body.parentId);
  assertOrgUnitLeader(body.leaderUserId);
  const newUnit = {
    id: `org-${crypto5.randomUUID()}`,
    code: body.code,
    name: body.name,
    type: body.type,
    parentId: body.parentId,
    leaderUserId: body.leaderUserId,
    isActive: body.isActive,
    metadata: body.metadata,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  orgUnits.push(newUnit);
  await persistLocalState();
  return projectOrgUnit(newUnit);
});
app.patch("/api/v1/admin/org-units/:id", async (req) => {
  requireAdmin(getCurrentUser(req));
  const body = UpdateOrgUnitSchema.parse(req.body);
  const index = orgUnits.findIndex((unit) => unit.id === req.params.id);
  if (index < 0) throw new HttpProblem(404, "ORG_UNIT_NOT_FOUND", "Kh\xF4ng t\xECm th\u1EA5y \u0111\u01A1n v\u1ECB", "\u0110\u01A1n v\u1ECB kh\xF4ng t\u1ED3n t\u1EA1i.");
  const current = orgUnits[index];
  if (current.updatedAt !== body.expectedUpdatedAt) {
    throw new HttpProblem(409, "ORG_UNIT_VERSION_CONFLICT", "\u0110\u01A1n v\u1ECB \u0111\xE3 thay \u0111\u1ED5i", "H\xE3y t\u1EA3i l\u1EA1i d\u1EEF li\u1EC7u m\u1EDBi nh\u1EA5t tr\u01B0\u1EDBc khi l\u01B0u.");
  }
  const requestedCode = body.code;
  if (requestedCode !== void 0 && orgUnits.some((unit) => unit.id !== current.id && unit.code.toLocaleLowerCase("vi-VN") === requestedCode.toLocaleLowerCase("vi-VN"))) {
    throw new HttpProblem(409, "ORG_UNIT_CODE_EXISTS", "M\xE3 \u0111\u01A1n v\u1ECB \u0111\xE3 t\u1ED3n t\u1EA1i", "Vui l\xF2ng s\u1EED d\u1EE5ng m\u1ED9t m\xE3 \u0111\u01A1n v\u1ECB kh\xE1c.");
  }
  const nextParentId = body.parentId === null ? void 0 : body.parentId ?? current.parentId;
  assertOrgUnitParent(current.type, nextParentId, current.id);
  const nextLeaderUserId = body.leaderUserId === null ? void 0 : body.leaderUserId ?? current.leaderUserId;
  assertOrgUnitLeader(nextLeaderUserId);
  if (body.isActive === false) {
    const references = dependentOrgUnitReferences(current);
    if (references.length) throw new HttpProblem(409, "ORG_UNIT_HAS_DEPENDENCIES", "Ch\u01B0a th\u1EC3 ng\u1EEBng ho\u1EA1t \u0111\u1ED9ng \u0111\u01A1n v\u1ECB", `H\xE3y x\u1EED l\xFD ${references.join(", ")} tr\u01B0\u1EDBc khi ng\u1EEBng ho\u1EA1t \u0111\u1ED9ng \u0111\u01A1n v\u1ECB.`);
  }
  const { expectedUpdatedAt: _expectedUpdatedAt, ...changes } = body;
  orgUnits[index] = {
    ...current,
    ...changes,
    parentId: nextParentId,
    leaderUserId: nextLeaderUserId,
    metadata: body.metadata === null ? void 0 : body.metadata ?? current.metadata,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await persistLocalState();
  return projectOrgUnit(orgUnits[index]);
});
app.delete("/api/v1/admin/org-units/:id", async (req, reply) => {
  requireAdmin(getCurrentUser(req));
  const index = orgUnits.findIndex((unit) => unit.id === req.params.id);
  if (index < 0) throw new HttpProblem(404, "ORG_UNIT_NOT_FOUND", "Kh\xF4ng t\xECm th\u1EA5y \u0111\u01A1n v\u1ECB", "\u0110\u01A1n v\u1ECB kh\xF4ng t\u1ED3n t\u1EA1i.");
  const current = orgUnits[index];
  if (current.type === "HEAD_OFFICE") {
    throw new HttpProblem(409, "ORG_UNIT_ROOT_PROTECTED", "Kh\xF4ng th\u1EC3 x\xF3a H\u1ED9i s\u1EDF", "H\u1ED9i s\u1EDF l\xE0 \u0111\u01A1n v\u1ECB g\u1ED1c c\u1EE7a c\u01A1 c\u1EA5u t\u1ED5 ch\u1EE9c.");
  }
  const references = dependentOrgUnitReferences(current);
  if (references.length) {
    throw new HttpProblem(409, "ORG_UNIT_HAS_DEPENDENCIES", "Ch\u01B0a th\u1EC3 x\xF3a \u0111\u01A1n v\u1ECB", `H\xE3y x\u1EED l\xFD ${references.join(", ")} tr\u01B0\u1EDBc khi x\xF3a \u0111\u01A1n v\u1ECB.`);
  }
  orgUnits.splice(index, 1);
  await persistLocalState();
  return reply.code(204).send();
});
app.get("/api/v1/admin/users", async (req) => {
  requireAdmin(getCurrentUser(req));
  return appUsers.map((user) => {
    const team = user.internalTeamId ? orgUnits.find((unit) => unit.id === user.internalTeamId && unit.type === "INTERNAL_TEAM") : void 0;
    const branch = user.branchCode ? orgUnits.find((unit) => unit.code === user.branchCode && unit.type === "BRANCH") : void 0;
    const cluster = branch ? orgUnits.find((unit) => unit.id === branch.parentId && unit.type === "CLUSTER") : void 0;
    return {
      ...user,
      internalTeamName: team?.name ?? user.internalTeamName,
      branchName: branch?.name ?? user.branchName,
      clusterName: cluster?.name ?? user.clusterName
    };
  });
});
app.post("/api/v1/admin/users", async (req) => {
  requireAdmin(getCurrentUser(req));
  const body = CreateUserSchema.parse(req.body);
  if (appUsers.some((user) => user.email.toLowerCase() === body.email.toLowerCase())) {
    throw new HttpProblem(409, "USER_EMAIL_EXISTS", "Email \u0111\xE3 \u0111\u01B0\u1EE3c s\u1EED d\u1EE5ng", "\u0110\xE3 t\u1ED3n t\u1EA1i t\xE0i kho\u1EA3n v\u1EDBi email n\xE0y.");
  }
  const internalTeam = body.internalTeamId ? orgUnits.find((unit) => unit.id === body.internalTeamId && unit.type === "INTERNAL_TEAM" && unit.isActive) : void 0;
  if (body.internalTeamId && !internalTeam) {
    throw new HttpProblem(422, "INTERNAL_TEAM_INVALID", "Nh\xF3m n\u1ED9i b\u1ED9 kh\xF4ng h\u1EE3p l\u1EC7", "Nh\xF3m n\u1ED9i b\u1ED9 kh\xF4ng t\u1ED3n t\u1EA1i ho\u1EB7c \u0111\xE3 ng\u1EEBng ho\u1EA1t \u0111\u1ED9ng.");
  }
  if (body.teamRole === "LEAD" && appUsers.some((user) => user.isActive && user.internalTeamId === body.internalTeamId && user.teamRole === "LEAD")) {
    throw new HttpProblem(409, "INTERNAL_TEAM_LEAD_EXISTS", "Nh\xF3m \u0111\xE3 c\xF3 tr\u01B0\u1EDFng nh\xF3m", "M\u1ED7i nh\xF3m ch\u1EC9 c\xF3 m\u1ED9t Tr\u01B0\u1EDFng nh\xF3m ki\u1EC3m so\xE1t \u0111ang ho\u1EA1t \u0111\u1ED9ng.");
  }
  const branch = body.branchCode ? orgUnits.find((unit) => unit.code === body.branchCode && unit.type === "BRANCH" && unit.isActive) : void 0;
  const cluster = branch ? orgUnits.find((unit) => unit.id === branch.parentId && unit.type === "CLUSTER" && unit.isActive) : void 0;
  const department = branch && body.department ? orgUnits.find((unit) => unit.parentId === branch.id && unit.type === "DEPARTMENT" && unit.name === body.department && unit.isActive) : void 0;
  if (body.portal === "BRANCH" && (!branch || !cluster || !department)) {
    throw new HttpProblem(422, "BRANCH_ASSIGNMENT_INVALID", "Ph\xE2n c\xF4ng chi nh\xE1nh kh\xF4ng h\u1EE3p l\u1EC7", "Chi nh\xE1nh ho\u1EB7c Ph\xF2ng/PGD kh\xF4ng t\u1ED3n t\u1EA1i trong C\u1EE5m \u0111\u1ECBa b\xE0n \u0111\xE3 c\u1EA5u h\xECnh.");
  }
  const scopes = ["BRANCH_INPUT", "BRANCH_CONTROLLER"].includes(body.primaryRole) ? [{
    scopeType: "BRANCH",
    orgUnitId: branch?.id,
    orgUnitCode: branch?.code,
    clusterName: cluster?.name,
    branchName: branch?.name,
    departmentName: department?.name
  }] : ["ADMIN", "SUPERVISOR", "INTERNAL_APPROVER", "INTERNAL_OFFICER"].includes(body.primaryRole) ? [{ scopeType: "ALL" }] : [];
  const newUser = {
    id: `user-${crypto5.randomUUID()}`,
    username: body.username || body.email.split("@")[0],
    email: body.email,
    fullName: body.fullName,
    phone: body.phone,
    portal: body.portal,
    roles: body.roles,
    primaryRole: body.primaryRole,
    // Every account carries a CoPlus code so the UI can name its role the way the handbook does;
    // fall back to the closest match when the caller did not state one.
    coplusRole: body.coplusRole ?? inferCoPlusRole(body.roles),
    orgUnitId: internalTeam?.id ?? department?.id,
    internalTeamId: internalTeam?.id,
    internalTeamName: internalTeam?.name,
    teamRole: body.teamRole,
    clusterName: cluster?.name,
    branchCode: branch?.code,
    branchName: branch?.name,
    department: department?.name,
    isActive: body.isActive,
    scopes
  };
  const normalizedUsername = newUser.username.toLocaleLowerCase("vi-VN");
  if (credentialDirectory.some((item) => item.username === normalizedUsername)) {
    throw new HttpProblem(409, "USER_NAME_EXISTS", "T\xEAn \u0111\u0103ng nh\u1EADp \u0111\xE3 t\u1ED3n t\u1EA1i", "Ch\u1ECDn m\u1ED9t t\xEAn \u0111\u0103ng nh\u1EADp kh\xE1c.");
  }
  newUser.username = normalizedUsername;
  const temporaryPassword = body.password ? void 0 : generateTemporaryPassword();
  credentialDirectory.push({
    userId: newUser.id,
    username: normalizedUsername,
    passwordHash: await hashPassword(body.password ?? temporaryPassword)
  });
  appUsers.push(newUser);
  recordUserSecurityEvent(req, getCurrentUser(req), {
    type: "ADMIN_USER_CREATED",
    outcome: "SUCCESS",
    subject: newUser.username,
    detail: `C\u1EA5p t\xE0i kho\u1EA3n ${newUser.fullName} v\u1EDBi vai tr\xF2 ${newUser.roles.join(", ")} (${newUser.portal}).`
  });
  if (internalTeam && body.teamRole === "LEAD") {
    internalTeam.leaderUserId = newUser.id;
    internalTeam.leaderName = newUser.fullName;
    internalTeam.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  }
  await persistLocalState();
  return { user: newUser, temporaryPassword };
});
app.post("/api/v1/admin/users/:id/password", async (req) => {
  requireAdmin(getCurrentUser(req));
  const body = ResetUserPasswordSchema.parse(req.body ?? {});
  const user = appUsers.find((item) => item.id === req.params.id);
  if (!user) {
    throw new HttpProblem(404, "USER_NOT_FOUND", "Kh\xF4ng t\xECm th\u1EA5y t\xE0i kho\u1EA3n", "T\xE0i kho\u1EA3n kh\xF4ng t\u1ED3n t\u1EA1i.");
  }
  const temporaryPassword = body.password ? void 0 : generateTemporaryPassword();
  const passwordHash = await hashPassword(body.password ?? temporaryPassword);
  const existing = credentialDirectory.find((item) => item.userId === user.id);
  if (existing) existing.passwordHash = passwordHash;
  else credentialDirectory.push({ userId: user.id, username: user.username.toLocaleLowerCase("vi-VN"), passwordHash });
  const revokedSessions = authSessionStore.revokeAllForUser(user.id);
  clearLoginFailures(user.username.toLocaleLowerCase("vi-VN"));
  recordUserSecurityEvent(req, getCurrentUser(req), {
    type: "ADMIN_USER_PASSWORD_RESET",
    outcome: "SUCCESS",
    subject: user.username,
    detail: `\u0110\u1EB7t l\u1EA1i m\u1EADt kh\u1EA9u cho ${user.fullName}; thu h\u1ED3i ${revokedSessions} phi\xEAn \u0111ang m\u1EDF.`
  });
  authSessions = authSessionStore.records();
  await persistLocalState();
  return { user, temporaryPassword };
});
app.get("/api/v1/admin/channels", async (req) => {
  requireAdmin(getCurrentUser(req));
  return reportChannels;
});
app.get("/api/v1/channels/active", async () => reportChannels.filter((c) => c.isActive));
app.post("/api/v1/admin/channels", async (req) => {
  const user = getCurrentUser(req);
  requireAdmin(user);
  const id = `chan-${crypto5.randomUUID()}`;
  const payload = req.body ?? {};
  const body = CreateReportChannelSchema.parse({
    ...payload,
    description: payload.description ?? "",
    category: payload.category ?? "REGULAR_AUDIT",
    icon: payload.icon ?? "FileSpreadsheet",
    badgeColor: payload.badgeColor ?? "teal",
    inputMethods: payload.inputMethods ?? ["EXCEL_IMPORT", "WEB_FORM"],
    issuingDepartment: payload.issuingDepartment ?? "Ban Ki\u1EC3m to\xE1n N\u1ED9i b\u1ED9",
    isActive: payload.isActive ?? true,
    schemaConfig: payload.schemaConfig ?? defaultSchemaConfig(typeof payload.code === "string" ? payload.code : void 0),
    workflowConfig: payload.workflowConfig ?? defaultWorkflowConfig(id),
    slaConfig: payload.slaConfig ?? defaultSlaConfig(),
    integrationConfig: payload.integrationConfig ?? defaultIntegrationConfig()
  });
  if (reportChannels.some((channel) => channel.code.toUpperCase() === body.code.toUpperCase())) {
    throw new HttpProblem(409, "REPORT_TYPE_CODE_EXISTS", "M\xE3 lo\u1EA1i b\xE1o c\xE1o \u0111\xE3 t\u1ED3n t\u1EA1i", "H\xE3y ch\u1ECDn m\xE3 lo\u1EA1i b\xE1o c\xE1o kh\xE1c.");
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const currentVersionId = `${id}-v1`;
  const newChan = {
    ...body,
    id,
    code: body.code.toUpperCase(),
    configVersion: 1,
    currentVersionId,
    workflowConfig: { ...body.workflowConfig, id: `${currentVersionId}-workflow`, channelId: id },
    createdAt: now,
    updatedAt: now
  };
  reportChannels.push(newChan);
  reportChannelVersions.push({
    id: currentVersionId,
    channelId: id,
    versionNumber: 1,
    snapshot: structuredClone(newChan),
    createdByUserId: user.id,
    createdAt: now
  });
  await persistLocalState();
  return newChan;
});
app.patch("/api/v1/admin/channels/:id", async (req) => {
  const user = getCurrentUser(req);
  requireAdmin(user);
  const index = reportChannels.findIndex((channel) => channel.id === req.params.id);
  if (index < 0) throw new HttpProblem(404, "REPORT_TYPE_NOT_FOUND", "Kh\xF4ng t\xECm th\u1EA5y lo\u1EA1i b\xE1o c\xE1o", "Lo\u1EA1i b\xE1o c\xE1o kh\xF4ng t\u1ED3n t\u1EA1i.");
  const body = UpdateReportChannelSchema.parse(req.body);
  if (body.code && reportChannels.some((channel) => channel.id !== req.params.id && channel.code.toUpperCase() === body.code.toUpperCase())) {
    throw new HttpProblem(409, "REPORT_TYPE_CODE_EXISTS", "M\xE3 lo\u1EA1i b\xE1o c\xE1o \u0111\xE3 t\u1ED3n t\u1EA1i", "H\xE3y ch\u1ECDn m\xE3 lo\u1EA1i b\xE1o c\xE1o kh\xE1c.");
  }
  const current = reportChannels[index];
  const configVersion = current.configVersion + 1;
  const currentVersionId = `${current.id}-v${configVersion}`;
  const updated = normalizedReportChannel({
    ...current,
    ...body,
    code: (body.code ?? current.code).toUpperCase(),
    configVersion,
    currentVersionId,
    workflowConfig: body.workflowConfig ? { ...body.workflowConfig, id: `${currentVersionId}-workflow`, channelId: current.id } : { ...current.workflowConfig, id: `${currentVersionId}-workflow`, channelId: current.id },
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  reportChannels[index] = updated;
  reportChannelVersions.push({
    id: currentVersionId,
    channelId: current.id,
    versionNumber: configVersion,
    snapshot: structuredClone(updated),
    createdByUserId: user.id,
    createdAt: updated.updatedAt
  });
  await persistLocalState();
  return updated;
});
app.get("/api/v1/admin/channels/:id/versions", async (req) => {
  requireAdmin(getCurrentUser(req));
  if (!reportChannels.some((channel) => channel.id === req.params.id)) {
    throw new HttpProblem(404, "REPORT_TYPE_NOT_FOUND", "Kh\xF4ng t\xECm th\u1EA5y lo\u1EA1i b\xE1o c\xE1o", "Lo\u1EA1i b\xE1o c\xE1o kh\xF4ng t\u1ED3n t\u1EA1i.");
  }
  return reportChannelVersions.filter((version) => version.channelId === req.params.id).sort((left, right) => right.versionNumber - left.versionNumber);
});
app.get("/api/v1/admin/channels/:id/integration-readiness", async (req) => {
  requireAdmin(getCurrentUser(req));
  const channel = reportChannels.find((item) => item.id === req.params.id);
  if (!channel) throw new HttpProblem(404, "REPORT_TYPE_NOT_FOUND", "Kh\xF4ng t\xECm th\u1EA5y lo\u1EA1i b\xE1o c\xE1o", "Lo\u1EA1i b\xE1o c\xE1o kh\xF4ng t\u1ED3n t\u1EA1i.");
  const googleCredentialReady = process.env.GOOGLE_DRIVE_AUTH_MODE === "oauth-user" ? Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REDIRECT_URI) : Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS);
  const smtpReady = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.EMAIL_FROM);
  return {
    googleSheets: {
      configured: !channel.integrationConfig?.googleSheets.enabled || googleCredentialReady,
      message: channel.integrationConfig?.googleSheets.enabled && !googleCredentialReady ? "Thi\u1EBFu c\u1EA5u h\xECnh credential Google ph\xF9 h\u1EE3p tr\xEAn m\xE1y ch\u1EE7." : channel.integrationConfig?.googleSheets.enabled ? "M\xE1y ch\u1EE7 \u0111\xE3 c\xF3 th\xF4ng tin x\xE1c th\u1EF1c Google." : "\u0110ang t\u1EAFt."
    },
    email: {
      configured: !channel.integrationConfig?.email.enabled || smtpReady,
      message: channel.integrationConfig?.email.enabled && !smtpReady ? "Thi\u1EBFu SMTP_HOST, SMTP_USER, SMTP_PASSWORD ho\u1EB7c EMAIL_FROM tr\xEAn m\xE1y ch\u1EE7." : channel.integrationConfig?.email.enabled ? "M\xE1y ch\u1EE7 \u0111\xE3 c\xF3 c\u1EA5u h\xECnh SMTP." : "\u0110ang t\u1EAFt."
    }
  };
});
app.delete("/api/v1/admin/channels/:id", async (req, reply) => {
  requireAdmin(getCurrentUser(req));
  const index = reportChannels.findIndex((channel) => channel.id === req.params.id);
  if (index < 0) throw new HttpProblem(404, "REPORT_TYPE_NOT_FOUND", "Kh\xF4ng t\xECm th\u1EA5y lo\u1EA1i b\xE1o c\xE1o", "Lo\u1EA1i b\xE1o c\xE1o kh\xF4ng t\u1ED3n t\u1EA1i.");
  if (findings.some((finding) => finding.channelId === req.params.id)) {
    throw new HttpProblem(409, "REPORT_TYPE_IN_USE", "Kh\xF4ng th\u1EC3 x\xF3a lo\u1EA1i b\xE1o c\xE1o \u0111ang c\xF3 d\u1EEF li\u1EC7u", "H\xE3y chuy\u1EC3n lo\u1EA1i b\xE1o c\xE1o sang tr\u1EA1ng th\xE1i t\u1EA1m ng\u1EEBng \u0111\u1EC3 gi\u1EEF nguy\xEAn l\u1ECBch s\u1EED h\u1ED3 s\u01A1.");
  }
  reportChannels.splice(index, 1);
  reportChannelVersions = reportChannelVersions.filter((version) => version.channelId !== req.params.id);
  await persistLocalState();
  return reply.code(204).send();
});
function getAuditLogEntries() {
  return workflowEvents.map((event) => {
    const finding = findings.find((item) => item.id === event.findingId);
    return {
      id: event.id,
      timestamp: event.createdAt,
      eventType: event.command,
      actorName: event.actorName,
      actorRole: event.actorRole,
      targetEntity: finding ? `CIF ${finding.cif} (${finding.errorCode})` : `H\u1ED3 s\u01A1 ${event.findingId}`,
      details: event.rejectionReason || event.notes || `${event.fromStatus} \u2192 ${event.toStatus}`,
      findingId: event.findingId,
      cif: finding?.cif ?? "",
      errorCode: finding?.errorCode ?? "",
      branchCode: finding?.branchCode ?? ""
    };
  }).concat(securityEvents.map((event) => ({
    id: event.id,
    timestamp: event.occurredAt,
    eventType: event.type,
    actorName: event.actorName ?? event.subject ?? "Kh\xF4ng x\xE1c \u0111\u1ECBnh",
    actorRole: event.actorRole ?? "",
    targetEntity: event.subject ?? "H\u1EC7 th\u1ED1ng",
    details: event.ipAddress ? `${event.detail} (IP ${event.ipAddress})` : event.detail,
    findingId: "",
    cif: "",
    errorCode: "",
    branchCode: ""
  }))).sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}
function filterAuditLogEntries(entries, query) {
  const keyword = query?.trim().toLocaleLowerCase("vi");
  if (!keyword) return entries;
  return entries.filter((entry) => [
    entry.eventType,
    entry.actorName,
    entry.actorRole,
    entry.targetEntity,
    entry.details,
    entry.cif,
    entry.errorCode,
    entry.branchCode
  ].some((value) => value.toLocaleLowerCase("vi").includes(keyword)));
}
function auditCsvCell(value) {
  return `"${value.replaceAll('"', '""')}"`;
}
function canClearTestAuditEvents() {
  return DEMO_SEED_ENABLED && process.env.NODE_ENV !== "production" && process.env.DATA_STORE_MODE !== "postgres";
}
app.get("/api/v1/admin/audit-events", async (req) => {
  requireAdmin(getCurrentUser(req));
  return getAuditLogEntries();
});
app.get("/api/v1/admin/audit-events/export", async (req, reply) => {
  requireAdmin(getCurrentUser(req));
  const rows = filterAuditLogEntries(getAuditLogEntries(), req.query.query).map((entry) => [
    entry.timestamp,
    entry.eventType,
    entry.actorName,
    entry.actorRole,
    entry.targetEntity,
    entry.details,
    entry.cif,
    entry.errorCode,
    entry.branchCode
  ].map(auditCsvCell).join(","));
  const csv = [
    "Th\u1EDDi gian,S\u1EF1 ki\u1EC7n,Ng\u01B0\u1EDDi thao t\xE1c,Vai tr\xF2,\u0110\u1ED1i t\u01B0\u1EE3ng,Chi ti\u1EBFt,CIF,M\xE3 l\u1ED7i,M\xE3 chi nh\xE1nh",
    ...rows
  ].join("\n");
  const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  return reply.type("text/csv; charset=utf-8").header("Content-Disposition", `attachment; filename="nhat-ky-xu-ly-${date}.csv"`).send(`\uFEFF${csv}`);
});
app.delete("/api/v1/admin/audit-events", async (req) => {
  requireAdmin(getCurrentUser(req));
  if (!canClearTestAuditEvents()) {
    throw new HttpProblem(
      409,
      "AUDIT_LOG_CLEAR_FORBIDDEN",
      "Kh\xF4ng th\u1EC3 x\xF3a nh\u1EADt k\xFD v\u1EADn h\xE0nh",
      "Ch\u1EC9 m\xF4i tr\u01B0\u1EDDng local/test c\xF3 d\u1EEF li\u1EC7u th\u1EED nghi\u1EC7m m\u1EDBi cho ph\xE9p x\xF3a nh\u1EADt k\xFD."
    );
  }
  const cleared = workflowEvents.length + securityEvents.length;
  workflowEvents = [];
  securityEvents = [];
  await persistLocalState();
  return { cleared };
});
app.get("/api/v1/workspace/my-work", async (req) => {
  const user = getCurrentUser(req);
  const scoped = filterFindingsByScope(findings, user);
  const actionable = scoped.filter((finding) => isActionableForUser(finding, user)).map((finding) => withWorkspaceProjection(finding, user.id)).sort((left, right) => left.deadlineDate.localeCompare(right.deadlineDate));
  const followingIds = new Set(
    findingFollows.filter((item) => item.userId === user.id).map((item) => item.findingId)
  );
  const following = scoped.filter((finding) => followingIds.has(finding.id)).map((finding) => withWorkspaceProjection(finding, user.id)).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const accepted = workspaceAccepted.filter((target) => target.userId === user.id).map((target) => projectWorkspaceTarget(target, user)).filter((target) => Boolean(target)).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const watchTargets = sortWatchTargets(workspaceWatchTargets.filter((target) => target.userId === user.id).map((target) => projectWorkspaceTarget(target, user)).filter((target) => Boolean(target)));
  return { actionable, following, accepted, watchTargets };
});
app.put("/api/v1/workspace/accepted", async (req) => {
  const user = getCurrentUser(req);
  requireRoles(user, ["INTERNAL_OFFICER", "SUPERVISOR", "INTERNAL_APPROVER", "BRANCH_INPUT", "BRANCH_CONTROLLER"]);
  const dto = WorkspaceTargetCommandSchema.parse(req.body);
  return addWorkspaceTarget(workspaceAccepted, dto, user);
});
app.delete("/api/v1/workspace/accepted/:id", async (req, reply) => {
  const user = getCurrentUser(req);
  const exists = workspaceAccepted.some((target) => target.id === req.params.id && target.userId === user.id);
  if (!exists) throw new HttpProblem(404, "WORKSPACE_TARGET_NOT_FOUND", "Kh\xF4ng t\xECm th\u1EA5y c\xF4ng vi\u1EC7c", "C\xF4ng vi\u1EC7c kh\xF4ng t\u1ED3n t\u1EA1i ho\u1EB7c kh\xF4ng thu\u1ED9c ng\u01B0\u1EDDi d\xF9ng hi\u1EC7n t\u1EA1i.");
  workspaceAccepted = workspaceAccepted.filter((target) => target.id !== req.params.id || target.userId !== user.id);
  await persistLocalState();
  return reply.code(204).send();
});
app.put("/api/v1/workspace/watch-targets", async (req) => {
  const user = getCurrentUser(req);
  requireRoles(user, ["INTERNAL_OFFICER", "SUPERVISOR", "INTERNAL_APPROVER", "BRANCH_INPUT", "BRANCH_CONTROLLER"]);
  const dto = WorkspaceTargetCommandSchema.parse(req.body);
  return addWorkspaceTarget(workspaceWatchTargets, dto, user);
});
app.patch("/api/v1/workspace/watch-targets/:id/priority", async (req) => {
  const user = getCurrentUser(req);
  const body = SetWorkspacePrioritySchema.parse(req.body);
  const target = workspaceWatchTargets.find((item) => item.id === req.params.id && item.userId === user.id);
  if (!target) throw new HttpProblem(404, "WORKSPACE_TARGET_NOT_FOUND", "Kh\xF4ng t\xECm th\u1EA5y theo d\xF5i", "M\u1EE5c theo d\xF5i kh\xF4ng t\u1ED3n t\u1EA1i ho\u1EB7c kh\xF4ng thu\u1ED9c ng\u01B0\u1EDDi d\xF9ng hi\u1EC7n t\u1EA1i.");
  target.isPriority = body.isPriority;
  target.prioritizedAt = body.isPriority ? (/* @__PURE__ */ new Date()).toISOString() : void 0;
  await persistLocalState();
  return projectWorkspaceTarget(target, user);
});
app.delete("/api/v1/workspace/watch-targets/:id", async (req, reply) => {
  const user = getCurrentUser(req);
  const exists = workspaceWatchTargets.some((target) => target.id === req.params.id && target.userId === user.id);
  if (!exists) throw new HttpProblem(404, "WORKSPACE_TARGET_NOT_FOUND", "Kh\xF4ng t\xECm th\u1EA5y theo d\xF5i", "M\u1EE5c theo d\xF5i kh\xF4ng t\u1ED3n t\u1EA1i ho\u1EB7c kh\xF4ng thu\u1ED9c ng\u01B0\u1EDDi d\xF9ng hi\u1EC7n t\u1EA1i.");
  workspaceWatchTargets = workspaceWatchTargets.filter((target) => target.id !== req.params.id || target.userId !== user.id);
  await persistLocalState();
  return reply.code(204).send();
});
app.put("/api/v1/findings/:id/follow", async (req) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  if (!findingFollows.some((item) => item.userId === user.id && item.findingId === finding.id)) {
    findingFollows.push({ userId: user.id, findingId: finding.id, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
    await persistLocalState();
  }
  return { findingId: finding.id, isFollowing: true };
});
app.delete("/api/v1/findings/:id/follow", async (req) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  findingFollows = findingFollows.filter((item) => item.userId !== user.id || item.findingId !== finding.id);
  await persistLocalState();
  return { findingId: finding.id, isFollowing: false };
});
app.get("/api/v1/findings", async (req) => {
  const user = getCurrentUser(req);
  let result = filterFindingsByScope(findings, user);
  const { page, limit } = PaginationQuerySchema.parse(req.query);
  const query = req.query ?? {};
  const { channelId, campaignId, workflowStatus, slaStatus, search } = query;
  if (channelId) result = result.filter((f) => f.channelId === channelId || f.channelCode === channelId);
  if (campaignId) result = result.filter((f) => f.campaignId === campaignId);
  if (workflowStatus) result = result.filter((f) => f.workflowStatus === workflowStatus);
  if (slaStatus) result = result.filter((f) => f.slaStatus === slaStatus);
  if (search) {
    const s = search.toLowerCase();
    result = result.filter((f) => f.cif.includes(s) || f.customerName.toLowerCase().includes(s) || f.errorCode.toLowerCase().includes(s) || f.branchName.toLowerCase().includes(s));
  }
  const total = result.length;
  const offset = (page - 1) * limit;
  const items = result.slice(offset, offset + limit).map(withEvidenceProjection);
  return {
    items,
    total,
    page,
    limit,
    hasMore: offset + items.length < total
  };
});
app.get("/api/v1/findings/:id", async (req, reply) => {
  const user = getCurrentUser(req);
  const found = getScopedFindingOrThrow(req.params.id, user);
  const findingEvidences = availableEvidencesForFinding(found.id);
  const findingHistory = workflowEvents.filter((w) => w.findingId === found.id);
  return {
    ...found,
    ...reportPresentationForFinding(found),
    evidenceCount: findingEvidences.length,
    evidences: findingEvidences,
    history: findingHistory
  };
});
app.post("/api/v1/findings/:id/sub-items", async (req, reply) => {
  const user = getCurrentUser(req);
  requireRoles(user, ["INTERNAL_OFFICER", "SUPERVISOR"]);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  if (finding.workflowStatus === "WAIVED_RESOLVED") {
    throw new HttpProblem(409, "FINDING_ALREADY_RESOLVED", "H\u1ED3 s\u01A1 \u0111\xE3 \u0111\xF3ng", "Kh\xF4ng th\u1EC3 b\u1ED5 sung \xFD sai s\xF3t v\xE0o h\u1ED3 s\u01A1 \u0111\xE3 \u0111\xF3ng.");
  }
  const dto = CreateFindingSubItemSchema.parse(req.body);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const subItems = finding.subItems ?? [];
  subItems.push({
    id: `sub-${crypto5.randomUUID()}`,
    findingId: finding.id,
    content: dto.content,
    order: subItems.length + 1,
    status: "OPEN",
    createdAt: now,
    updatedAt: now
  });
  finding.subItems = subItems;
  finding.quantity = subItems.length;
  finding.version += 1;
  finding.updatedAt = now;
  await persistLocalState();
  return reply.code(201).send({
    ...finding,
    evidenceCount: availableEvidencesForFinding(finding.id).length,
    evidences: availableEvidencesForFinding(finding.id),
    history: workflowEvents.filter((event) => event.findingId === finding.id)
  });
});
app.post("/api/v1/findings/:id/sub-items/review", async (req) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  const branchReview = user.roles.includes("BRANCH_CONTROLLER") && finding.workflowStatus === "SUBMITTED_BRANCH";
  const branchLeaderReview = user.roles.includes("BRANCH_LEADER") && finding.workflowStatus === "SUBMITTED_BRANCH_LEADER";
  const internalReview = user.roles.some((role) => ["SUPERVISOR", "INTERNAL_APPROVER"].includes(role)) && finding.workflowStatus === "SUBMITTED_INTERNAL";
  if (!branchReview && !branchLeaderReview && !internalReview) {
    throw new HttpProblem(409, "SUB_ITEM_REVIEW_NOT_ALLOWED", "Ch\u01B0a \u0111\u1EBFn b\u01B0\u1EDBc \u0111\xE1nh gi\xE1 \xFD sai s\xF3t", "T\xE0i kho\u1EA3n ho\u1EB7c tr\u1EA1ng th\xE1i h\u1ED3 s\u01A1 kh\xF4ng ph\xF9 h\u1EE3p \u0111\u1EC3 \u0111\xE1nh gi\xE1 t\u1EEBng \xFD sai s\xF3t.");
  }
  const dto = ReviewFindingSubItemsSchema.parse(req.body);
  const subItems = finding.subItems ?? [];
  const decisionIds = new Set(dto.decisions.map((item) => item.subItemId));
  if (decisionIds.size !== subItems.length || subItems.some((item) => !decisionIds.has(item.id))) {
    throw new HttpProblem(422, "SUB_ITEM_DECISIONS_INCOMPLETE", "Ch\u01B0a \u0111\xE1nh gi\xE1 \u0111\u1EE7 c\xE1c \xFD sai s\xF3t", "Ph\u1EA3i ch\u1ECDn ch\u1EA5p nh\u1EADn ho\u1EB7c chuy\u1EC3n tr\u1EA3 cho t\u1EEBng \xFD sai s\xF3t trong m\xE3 l\u1ED7i.");
  }
  if (dto.decisions.every((item) => item.decision === "ACCEPT")) requireAvailableEvidence(finding);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const decisions = new Map(dto.decisions.map((item) => [item.subItemId, item.decision]));
  finding.subItems = subItems.map((item) => ({
    ...item,
    status: decisions.get(item.id) === "ACCEPT" ? "ACCEPTED" : "RETURNED",
    reviewerNote: dto.reviewNote,
    reviewedByUserId: user.id,
    reviewedByName: user.fullName,
    reviewedAt: now,
    updatedAt: now
  }));
  finding.version += 1;
  finding.updatedAt = now;
  workflowEvents.push({
    id: `evt-${crypto5.randomUUID()}`,
    findingId: finding.id,
    command: "REVIEW_SUB_ITEMS",
    fromStatus: finding.workflowStatus,
    toStatus: finding.workflowStatus,
    actorUserId: user.id,
    actorName: user.fullName,
    actorRole: user.primaryRole,
    notes: dto.reviewNote,
    createdAt: now
  });
  await persistLocalState();
  return {
    ...finding,
    evidenceCount: availableEvidencesForFinding(finding.id).length,
    evidences: availableEvidencesForFinding(finding.id),
    history: workflowEvents.filter((event) => event.findingId === finding.id)
  };
});
app.get("/api/v1/customers/:cif/case", async (req) => {
  const user = getCurrentUser(req);
  const accessibleFindings = filterFindingsByScope(findings, user).filter((item) => item.cif === req.params.cif);
  const branchCodes = new Set(accessibleFindings.map((item) => item.branchCode));
  if (!req.query.branchCode && branchCodes.size > 1) {
    throw new HttpProblem(409, "CUSTOMER_CASE_AMBIGUOUS", "CIF t\u1ED3n t\u1EA1i t\u1EA1i nhi\u1EC1u chi nh\xE1nh", "H\xE3y truy\u1EC1n branchCode \u0111\u1EC3 x\xE1c \u0111\u1ECBnh \u0111\xFAng h\u1ED3 s\u01A1 kh\xE1ch h\xE0ng, tr\xE1nh g\u1ED9p sai d\u1EEF li\u1EC7u gi\u1EEFa c\xE1c chi nh\xE1nh.");
  }
  const customerFindings = accessibleFindings.filter((item) => !req.query.branchCode || item.branchCode === req.query.branchCode).map((item) => ({
    ...item,
    ...reportPresentationForFinding(item),
    evidenceCount: availableEvidencesForFinding(item.id).length,
    evidences: availableEvidencesForFinding(item.id),
    history: workflowEvents.filter((event) => event.findingId === item.id)
  })).sort((a, b) => a.errorCode.localeCompare(b.errorCode));
  if (customerFindings.length === 0) {
    throw new HttpProblem(404, "CUSTOMER_CASE_NOT_FOUND", "Kh\xF4ng t\xECm th\u1EA5y h\u1ED3 s\u01A1 kh\xE1ch h\xE0ng", "Kh\xE1ch h\xE0ng kh\xF4ng t\u1ED3n t\u1EA1i ho\u1EB7c n\u1EB1m ngo\xE0i ph\u1EA1m vi d\u1EEF li\u1EC7u \u0111\u01B0\u1EE3c c\u1EA5p.");
  }
  const first = customerFindings[0];
  return {
    cif: first.cif,
    customerName: first.customerName,
    clusterName: first.clusterName,
    branchCode: first.branchCode,
    branchName: first.branchName,
    department: first.department,
    officerName: first.officerName,
    deptHeadName: first.deptHeadName,
    creditBalance: first.creditBalance,
    totalExposureAmount: customerFindings.reduce((sum, finding) => sum + finding.exposureAmount, 0),
    totalFindings: customerFindings.length,
    openFindings: customerFindings.filter((finding) => finding.workflowStatus !== "WAIVED_RESOLVED").length,
    findings: customerFindings
  };
});
app.post("/api/v1/findings", async (req) => {
  const user = getCurrentUser(req);
  requireRoles(user, ["ADMIN", "INTERNAL_OFFICER"]);
  const b = WebFormFindingSchema.parse(req.body);
  const newFinding = createFindingFromDto(b, user, `find-${crypto5.randomUUID()}`);
  await ensureFindingDriveFolder(newFinding);
  findings.unshift(newFinding);
  await persistLocalState();
  return newFinding;
});
app.post("/api/v1/imports/findings", async (req, reply) => {
  const user = getCurrentUser(req);
  requireRoles(user, ["ADMIN", "INTERNAL_OFFICER", "SUPERVISOR"]);
  const batch = BulkFindingImportSchema.parse(req.body);
  const imported = [];
  let duplicateCount = 0;
  const deduplicationKey = (row) => [
    row.channelId,
    row.branchCode,
    row.cif,
    row.errorCode,
    row.decisionNo || ""
  ].join("");
  const seenKeys = new Set(findings.map((item) => deduplicationKey(item)));
  for (const row of batch.rows) {
    const key = deduplicationKey(row);
    if (seenKeys.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seenKeys.add(key);
    imported.push(createFindingFromDto(row, user));
  }
  const batchId = `batch-${crypto5.randomUUID()}`;
  const channel = reportChannels.find((item) => item.id === batch.rows[0].channelId);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  findings.unshift(...imported);
  importBatches.unshift({
    id: batchId,
    channelId: channel.id,
    channelName: channel.name,
    channelVersionId: channel.currentVersionId || "v1",
    fileName: batch.sourceFileName,
    sourceType: "API_BULK",
    totalRows: batch.rows.length,
    validRowsCount: imported.length,
    errorRowsCount: duplicateCount,
    status: "COMMITTED",
    uploadedByUserId: user.id,
    uploadedByName: user.fullName,
    createdAt: now,
    committedAt: now,
    committedFindingsCount: imported.length
  });
  await persistLocalState();
  return reply.code(201).send({
    batchId,
    sourceFileName: batch.sourceFileName,
    customerCount: uniqueCustomerCount(imported),
    findingCount: imported.length,
    duplicateCount,
    findings: imported
  });
});
app.get("/api/v1/findings/:id/approval-candidates", async (req) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  return approvalCandidatesForFinding(finding);
});
app.put("/api/v1/findings/:id/special-case", async (req) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  requireRoles(user, ["ADMIN", "SUPERVISOR", "INTERNAL_OFFICER", "INTERNAL_APPROVER", "BRANCH_INPUT"]);
  if (finding.workflowStatus !== "PENDING" && finding.workflowStatus !== "REJECTED") {
    throw new HttpProblem(409, "SPECIAL_CASE_LOCKED_AFTER_SUBMISSION", "D\u1EA5u sao \u0111\xE3 kh\xF3a", "Ch\u1EC9 \u0111\xE1nh d\u1EA5u tr\u01B0\u1EDDng h\u1EE3p \u0111\u1EB7c bi\u1EC7t khi h\u1ED3 s\u01A1 \u0111ang ch\u1EDD kh\u1EAFc ph\u1EE5c ho\u1EB7c \u0111\xE3 b\u1ECB tr\u1EA3 v\u1EC1.");
  }
  const dto = SetFindingSpecialCaseSchema.parse(req.body);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  finding.isSpecialCase = dto.isSpecialCase;
  finding.version += 1;
  finding.updatedAt = now;
  workflowEvents.push({
    id: `evt-${crypto5.randomUUID()}`,
    findingId: finding.id,
    command: "SET_SPECIAL_CASE",
    fromStatus: finding.workflowStatus,
    toStatus: finding.workflowStatus,
    actorUserId: user.id,
    actorName: user.fullName,
    actorRole: user.primaryRole,
    notes: dto.isSpecialCase ? "\u0110\xE1nh d\u1EA5u tr\u01B0\u1EDDng h\u1EE3p \u0111\u1EB7c bi\u1EC7t: b\u1ED5 sung b\u01B0\u1EDBc L\xE3nh \u0111\u1EA1o chi nh\xE1nh ph\xEA duy\u1EC7t b\u1EAFt bu\u1ED9c tr\u01B0\u1EDBc khi l\xEAn H\u1ED9i s\u1EDF." : "B\u1ECF \u0111\xE1nh d\u1EA5u tr\u01B0\u1EDDng h\u1EE3p \u0111\u1EB7c bi\u1EC7t: Ki\u1EC3m so\xE1t chi nh\xE1nh chuy\u1EC3n th\u1EB3ng l\xEAn H\u1ED9i s\u1EDF.",
    createdAt: now
  });
  await persistLocalState();
  return {
    ...finding,
    evidenceCount: availableEvidencesForFinding(finding.id).length,
    evidences: availableEvidencesForFinding(finding.id),
    history: workflowEvents.filter((event) => event.findingId === finding.id)
  };
});
app.post("/api/v1/findings/:id/actions/submit-branch", async (req, reply) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  const dto = SubmitBranchCommandSchema.parse(req.body);
  const idempotency = idempotencyContext(req, user, dto);
  if (idempotency.replay) return idempotency.replay;
  const fromStatus = finding.workflowStatus;
  try {
    if (dto.expectedVersion !== finding.version) {
      throw new HttpProblem(409, "VERSION_CONFLICT", "Xung \u0111\u1ED9t phi\xEAn b\u1EA3n", `H\u1ED3 s\u01A1 \u0111\xE3 \u0111\u01B0\u1EE3c c\u1EADp nh\u1EADt b\u1EDFi ng\u01B0\u1EDDi kh\xE1c (version hi\u1EC7n t\u1EA1i: ${finding.version}, expected: ${dto.expectedVersion}).`);
    }
    const pinnedVersion = reportChannelVersions.find((version) => version.id === finding.channelVersionId);
    const workflowType = pinnedVersion?.snapshot.workflowConfig?.workflowType ?? reportChannels.find((channel) => channel.id === finding.channelId)?.workflowConfig?.workflowType ?? "TWO_TIER";
    requireAvailableEvidence(finding);
    if (workflowType !== "ONE_TIER") {
      finding.approvalRoute = resolveApprovalRoute(finding, workflowType, user);
    }
    const updated = workflowService.executeSubmitBranch(finding, dto, user, workflowType);
    Object.assign(finding, updated);
    workflowEvents.push({
      id: `evt-${crypto5.randomUUID()}`,
      findingId: finding.id,
      command: "SUBMIT_BRANCH",
      fromStatus,
      toStatus: updated.workflowStatus,
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.primaryRole,
      notes: dto.resolutionNotes,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    rememberIdempotentResponse(idempotency, finding);
    await persistLocalState();
    return finding;
  } catch (err) {
    throw workflowErrorToProblem(err);
  }
});
app.post("/api/v1/findings/:id/actions/branch-control-approve", async (req, reply) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  const dto = BranchControlApproveCommandSchema.parse(req.body);
  const idempotency = idempotencyContext(req, user, dto);
  if (idempotency.replay) return idempotency.replay;
  const fromStatus = finding.workflowStatus;
  try {
    const updated = workflowService.executeBranchControlApprove(finding, dto, user);
    requireAvailableEvidence(finding);
    Object.assign(finding, updated);
    workflowEvents.push({
      id: `evt-${crypto5.randomUUID()}`,
      findingId: finding.id,
      command: "BRANCH_CONTROL_APPROVE",
      fromStatus,
      toStatus: updated.workflowStatus,
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.primaryRole,
      notes: dto.notes || "Ki\u1EC3m so\xE1t chi nh\xE1nh \u0111\u1ED3ng \xFD h\u1ED3 s\u01A1 kh\u1EAFc ph\u1EE5c.",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    rememberIdempotentResponse(idempotency, finding);
    await persistLocalState();
    return finding;
  } catch (err) {
    throw workflowErrorToProblem(err);
  }
});
app.post("/api/v1/findings/:id/actions/branch-control-reject", async (req, reply) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  const dto = BranchControlRejectCommandSchema.parse(req.body);
  const idempotency = idempotencyContext(req, user, dto);
  if (idempotency.replay) return idempotency.replay;
  const fromStatus = finding.workflowStatus;
  try {
    const updated = workflowService.executeBranchControlReject(finding, dto, user);
    Object.assign(finding, updated);
    workflowEvents.push({
      id: `evt-${crypto5.randomUUID()}`,
      findingId: finding.id,
      command: "BRANCH_CONTROL_REJECT",
      fromStatus,
      toStatus: "REJECTED",
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.primaryRole,
      rejectionReason: dto.reason,
      rejectedFromStage: "BRANCH_CONTROL_REVIEW",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    rememberIdempotentResponse(idempotency, finding);
    await persistLocalState();
    return finding;
  } catch (err) {
    throw workflowErrorToProblem(err);
  }
});
app.post("/api/v1/findings/:id/actions/branch-leader-approve", async (req) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  const dto = BranchLeaderApproveCommandSchema.parse(req.body);
  const idempotency = idempotencyContext(req, user, dto);
  if (idempotency.replay) return idempotency.replay;
  const fromStatus = finding.workflowStatus;
  try {
    const updated = workflowService.executeBranchLeaderApprove(finding, dto, user);
    requireAvailableEvidence(finding);
    Object.assign(finding, updated);
    workflowEvents.push({
      id: `evt-${crypto5.randomUUID()}`,
      findingId: finding.id,
      command: "BRANCH_LEADER_APPROVE",
      fromStatus,
      toStatus: updated.workflowStatus,
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.primaryRole,
      notes: dto.notes || "L\xE3nh \u0111\u1EA1o chi nh\xE1nh \u0111\u1ED3ng \xFD chuy\u1EC3n h\u1ED3 s\u01A1 l\xEAn Kh\u1ED1i N\u1ED9i B\u1ED9.",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    rememberIdempotentResponse(idempotency, finding);
    await persistLocalState();
    return finding;
  } catch (err) {
    throw workflowErrorToProblem(err);
  }
});
app.post("/api/v1/findings/:id/actions/branch-leader-reject", async (req) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  const dto = BranchLeaderRejectCommandSchema.parse(req.body);
  const idempotency = idempotencyContext(req, user, dto);
  if (idempotency.replay) return idempotency.replay;
  const fromStatus = finding.workflowStatus;
  try {
    const updated = workflowService.executeBranchLeaderReject(finding, dto, user);
    Object.assign(finding, updated);
    workflowEvents.push({
      id: `evt-${crypto5.randomUUID()}`,
      findingId: finding.id,
      command: "BRANCH_LEADER_REJECT",
      fromStatus,
      toStatus: updated.workflowStatus,
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.primaryRole,
      rejectionReason: dto.reason,
      rejectedFromStage: "BRANCH_LEADER_REVIEW",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    rememberIdempotentResponse(idempotency, finding);
    await persistLocalState();
    return finding;
  } catch (err) {
    throw workflowErrorToProblem(err);
  }
});
app.post("/api/v1/findings/:id/actions/internal-waive", async (req, reply) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  const dto = InternalWaiveCommandSchema.parse(req.body);
  const idempotency = idempotencyContext(req, user, dto);
  if (idempotency.replay) return idempotency.replay;
  const fromStatus = finding.workflowStatus;
  try {
    const updated = workflowService.executeInternalWaive(finding, dto, user);
    requireAvailableEvidence(finding);
    Object.assign(finding, updated);
    workflowEvents.push({
      id: `evt-${crypto5.randomUUID()}`,
      findingId: finding.id,
      command: "INTERNAL_WAIVE",
      fromStatus,
      toStatus: "WAIVED_RESOLVED",
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.primaryRole,
      notes: `S\u1ED1 c\xF4ng v\u0103n ch\u1EA5p thu\u1EADn b\u1ECF l\u1ED7i: ${dto.decisionNumber}. ${dto.notes || ""}`,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    rememberIdempotentResponse(idempotency, finding);
    await persistLocalState();
    return finding;
  } catch (err) {
    throw workflowErrorToProblem(err);
  }
});
app.post("/api/v1/findings/:id/actions/internal-reject", async (req, reply) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.id, user);
  const dto = InternalRejectCommandSchema.parse(req.body);
  const idempotency = idempotencyContext(req, user, dto);
  if (idempotency.replay) return idempotency.replay;
  const fromStatus = finding.workflowStatus;
  try {
    const updated = workflowService.executeInternalReject(finding, dto, user);
    Object.assign(finding, updated);
    workflowEvents.push({
      id: `evt-${crypto5.randomUUID()}`,
      findingId: finding.id,
      command: "INTERNAL_REJECT",
      fromStatus,
      toStatus: "REJECTED",
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.primaryRole,
      rejectionReason: dto.reason,
      rejectedFromStage: "INTERNAL_REVIEW",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    rememberIdempotentResponse(idempotency, finding);
    await persistLocalState();
    return finding;
  } catch (err) {
    throw workflowErrorToProblem(err);
  }
});
function evidenceFolderPath(finding) {
  return googleDriveService.generateFolderPath({
    campaignCode: auditCampaigns.find((campaign) => campaign.id === finding.campaignId)?.code,
    channelCode: finding.channelCode,
    year: Number((finding.auditDate || finding.createdAt).slice(0, 4)) || (/* @__PURE__ */ new Date()).getFullYear(),
    clusterName: finding.clusterName,
    branchCode: finding.branchCode,
    cif: finding.cif,
    customerName: finding.customerName,
    errorCode: finding.errorCode
  });
}
function requireEvidenceUploadAccess(req, findingId) {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(findingId, user);
  requireRoles(user, ["BRANCH_INPUT"]);
  if (!canManageEvidenceAtBranch(finding.workflowStatus)) throw new HttpProblem(409, "EVIDENCE_LOCKED_AFTER_SUBMISSION", "T\xE0i li\u1EC7u \u0111\xE3 kh\xF3a", "Ch\u1EC9 \u0111\u01B0\u1EE3c thay \u0111\u1ED5i t\xE0i li\u1EC7u khi h\u1ED3 s\u01A1 \u0111ang \u1EDF b\u01B0\u1EDBc chi nh\xE1nh x\u1EED l\xFD.");
  return { user, finding };
}
function registerEvidence(finding, user, uploadResult, fileName) {
  const duplicate = evidences.find((item) => item.findingId === finding.id && item.driveFileId === uploadResult.driveFileId && item.status === "AVAILABLE");
  if (duplicate) return duplicate;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const evidence = {
    id: `evi-${crypto5.randomUUID()}`,
    findingId: finding.id,
    fileName,
    fileSize: uploadResult.fileSize,
    mimeType: uploadResult.mimeType,
    driveFileId: uploadResult.driveFileId,
    driveUrl: uploadResult.driveUrl,
    sha256Checksum: uploadResult.sha256Checksum,
    status: "AVAILABLE",
    uploadedByUserId: user.id,
    uploadedByName: user.fullName,
    uploadedByRole: user.primaryRole,
    versionNumber: 1,
    createdAt: now,
    updatedAt: now
  };
  evidences.push(evidence);
  finding.evidenceCount = availableEvidencesForFinding(finding.id).length;
  return evidence;
}
app.post("/api/v1/findings/:id/evidence/upload-session", async (req) => {
  const { finding } = requireEvidenceUploadAccess(req, req.params.id);
  const dto = CreateEvidenceUploadSessionSchema.parse(req.body);
  const fileName = googleDriveService.validateUploadMetadata(dto.fileName, dto.mimeType, dto.fileSize);
  if ((await googleDriveService.getStorageStatus()).mode !== "google-drive") return { uploadMode: "local" };
  return googleDriveService.createResumableUploadSession({ ...dto, fileName, folderPath: evidenceFolderPath(finding), findingId: finding.id });
});
app.post("/api/v1/findings/:id/evidence/complete", async (req) => {
  const { user, finding } = requireEvidenceUploadAccess(req, req.params.id);
  const dto = CompleteEvidenceDirectUploadSchema.parse(req.body);
  const fileName = googleDriveService.validateUploadMetadata(dto.fileName, dto.mimeType, dto.fileSize);
  const uploadResult = await googleDriveService.completeResumableUpload({ ...dto, fileName, folderPath: evidenceFolderPath(finding), findingId: finding.id });
  const evidence = registerEvidence(finding, user, uploadResult, fileName);
  await persistLocalState();
  return evidence;
});
app.post("/api/v1/findings/:id/evidence", async (req, reply) => {
  const { user, finding } = requireEvidenceUploadAccess(req, req.params.id);
  const data = await req.file();
  if (!data) {
    throw new HttpProblem(422, "EVIDENCE_REQUIRED", "Thi\u1EBFu t\u1EC7p minh ch\u1EE9ng", "Y\xEAu c\u1EA7u ph\u1EA3i ch\u1EE9a m\u1ED9t t\u1EC7p multipart.");
  }
  const buffer = await data.toBuffer();
  const safeFileName = googleDriveService.validateUploadMetadata(data.filename, data.mimetype, buffer.length);
  const folderPath = evidenceFolderPath(finding);
  const uploadResult = await googleDriveService.uploadEvidenceFile({
    fileName: safeFileName,
    fileBuffer: buffer,
    mimeType: data.mimetype,
    folderPath,
    findingId: finding.id
  });
  const newEvidence = registerEvidence(finding, user, uploadResult, safeFileName);
  await persistLocalState();
  return newEvidence;
});
app.delete("/api/v1/findings/:findingId/evidence/:evidenceId", async (req, reply) => {
  const user = getCurrentUser(req);
  const finding = getScopedFindingOrThrow(req.params.findingId, user);
  requireRoles(user, ["BRANCH_INPUT"]);
  if (!canManageEvidenceAtBranch(finding.workflowStatus)) {
    throw new HttpProblem(409, "EVIDENCE_LOCKED_AFTER_SUBMISSION", "T\xE0i li\u1EC7u \u0111\xE3 kh\xF3a", "Ch\u1EC9 \u0111\u01B0\u1EE3c thay \u0111\u1ED5i t\xE0i li\u1EC7u khi h\u1ED3 s\u01A1 \u0111ang \u1EDF b\u01B0\u1EDBc chi nh\xE1nh x\u1EED l\xFD.");
  }
  const dto = RevokeEvidenceSchema.parse(req.body);
  const evidence = evidences.find((item) => item.id === req.params.evidenceId && item.findingId === finding.id && item.status === "AVAILABLE");
  if (!evidence) {
    throw new HttpProblem(404, "EVIDENCE_NOT_FOUND", "Kh\xF4ng t\xECm th\u1EA5y t\xE0i li\u1EC7u", "T\xE0i li\u1EC7u kh\xF4ng t\u1ED3n t\u1EA1i ho\u1EB7c \u0111\xE3 \u0111\u01B0\u1EE3c thu h\u1ED3i.");
  }
  const revokedAt = (/* @__PURE__ */ new Date()).toISOString();
  evidence.status = "REVOKED";
  evidence.revokedAt = revokedAt;
  evidence.revokedReason = dto.reason;
  evidence.revokedByUserId = user.id;
  evidence.updatedAt = revokedAt;
  finding.evidenceCount = availableEvidencesForFinding(finding.id).length;
  finding.updatedAt = revokedAt;
  await persistLocalState();
  return reply.code(204).send();
});
app.get("/api/v1/evidence/:driveFileId/content", async (req, reply) => {
  const user = getCurrentUser(req);
  const evidence = evidences.find((item) => item.driveFileId === req.params.driveFileId && item.status === "AVAILABLE");
  if (!evidence) {
    throw new HttpProblem(404, "EVIDENCE_NOT_FOUND", "Kh\xF4ng t\xECm th\u1EA5y minh ch\u1EE9ng", "Minh ch\u1EE9ng kh\xF4ng t\u1ED3n t\u1EA1i ho\u1EB7c \u0111\xE3 b\u1ECB thu h\u1ED3i.");
  }
  getScopedFindingOrThrow(evidence.findingId, user);
  const result = await googleDriveService.getFileContentStream(req.params.driveFileId);
  if (!result) {
    throw new HttpProblem(404, "EVIDENCE_CONTENT_NOT_FOUND", "Kh\xF4ng t\xECm th\u1EA5y n\u1ED9i dung minh ch\u1EE9ng", "Metadata t\u1ED3n t\u1EA1i nh\u01B0ng n\u1ED9i dung t\u1EC7p hi\u1EC7n kh\xF4ng kh\u1EA3 d\u1EE5ng.");
  }
  const mimeType = evidence.mimeType;
  const fileName = evidence.fileName || result.fileName;
  reply.header("Content-Disposition", isInlineSafeMimeType(mimeType) ? buildInlineContentDisposition(fileName) : buildAttachmentContentDisposition(fileName));
  reply.header("Content-Type", mimeType);
  reply.header("X-Content-Type-Options", "nosniff");
  recordUserSecurityEvent(req, user, {
    type: "DATA_EVIDENCE_DOWNLOADED",
    outcome: "SUCCESS",
    subject: evidence.findingId,
    detail: `Xem/t\u1EA3i minh ch\u1EE9ng ${fileName} c\u1EE7a h\u1ED3 s\u01A1 ${evidence.findingId}.`
  });
  await persistLocalState();
  return reply.send(result.stream);
});
app.get("/api/v1/dashboards/summary", async (req) => {
  const user = getCurrentUser(req);
  const scoped = filterFindingsByScope(findings, user);
  const active = scoped.filter((f) => f.workflowStatus !== "WAIVED_RESOLVED");
  const resolved = scoped.filter((f) => f.workflowStatus === "WAIVED_RESOLVED");
  const totalExposure = scoped.reduce((acc, f) => acc + (f.exposureAmount || 0), 0);
  const resolvedExposure = resolved.reduce((acc, f) => acc + (f.exposureAmount || 0), 0);
  const summary = {
    totalFindings: scoped.length,
    activeFindings: active.length,
    pendingRemediation: scoped.filter((f) => f.workflowStatus === "PENDING").length,
    submittedBranch: scoped.filter((f) => f.workflowStatus === "SUBMITTED_BRANCH").length,
    submittedInternal: scoped.filter((f) => f.workflowStatus === "SUBMITTED_INTERNAL").length,
    rejected: scoped.filter((f) => f.workflowStatus === "REJECTED").length,
    waivedResolved: resolved.length,
    onTrackCount: scoped.filter((f) => f.slaStatus === "ON_TRACK").length,
    dueSoonCount: scoped.filter((f) => f.slaStatus === "DUE_SOON").length,
    overdueCount: scoped.filter((f) => f.slaStatus === "OVERDUE").length,
    totalExposureAmount: totalExposure,
    resolvedExposureAmount: resolvedExposure,
    remediationRatePercent: scoped.length ? Math.round(resolved.length / scoped.length * 100) : 0
  };
  return summary;
});
app.get("/api/v1/reports/definitions", async (req) => {
  const user = getCurrentUser(req);
  return user.roles.includes("ADMIN") ? reportDefinitions : reportDefinitions.filter((definition) => definition.createdByUserId === user.id);
});
app.post("/api/v1/reports/definitions", async (req, reply) => {
  const user = getCurrentUser(req);
  const body = CreateReportDefinitionSchema.parse(req.body);
  if (body.query) assertReportConfigurationAvailable(body.query, body.exportColumns);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const definition = {
    id: `report-${crypto5.randomUUID()}`,
    name: body.name,
    description: body.description,
    filters: body.filters,
    columns: body.columns,
    query: body.query,
    exportColumns: body.exportColumns,
    createdByUserId: user.id,
    createdByName: user.fullName,
    createdAt: now,
    updatedAt: now
  };
  reportDefinitions.unshift(definition);
  await persistLocalState();
  return reply.code(201).send(definition);
});
app.get("/api/v1/admin/report-catalog", async (req) => {
  requireAdmin(getCurrentUser(req));
  return normalizedReportCatalogConfiguration();
});
app.put("/api/v1/admin/report-catalog", async (req) => {
  const user = getCurrentUser(req);
  requireAdmin(user);
  const body = UpdateReportCatalogConfigurationSchema.parse(req.body);
  if (body.expectedVersion !== reportCatalogConfiguration.version) {
    throw new HttpProblem(409, "REPORT_CATALOG_VERSION_CONFLICT", "C\u1EA5u h\xECnh \u0111\xE3 thay \u0111\u1ED5i", "H\xE3y t\u1EA3i l\u1EA1i c\u1EA5u h\xECnh m\u1EDBi nh\u1EA5t tr\u01B0\u1EDBc khi l\u01B0u.");
  }
  const baseFields = new Map(REPORT_FIELD_CATALOG.map((field) => [field.key, field]));
  const baseMetrics = new Map(REPORT_METRIC_CATALOG.map((metric) => [metric.key, metric]));
  reportCatalogConfiguration = {
    version: reportCatalogConfiguration.version + 1,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedByUserId: user.id,
    fields: body.fields.map((field) => ({ ...baseFields.get(field.key), ...field })),
    metrics: body.metrics.map((metric) => ({ ...baseMetrics.get(metric.key), ...metric }))
  };
  await persistLocalState();
  return normalizedReportCatalogConfiguration();
});
app.get("/api/v1/reports/catalog", async (req) => {
  const scoped = filterFindingsByScope(findings, getCurrentUser(req));
  return buildReportCatalog(scoped);
});
app.post("/api/v1/reports/runs", async (req) => {
  const query = ReportRunRequestSchema.parse(req.body);
  assertReportConfigurationAvailable(query);
  const scoped = filterFindingsByScope(findings, getCurrentUser(req));
  return executeReportRun(scoped, query);
});
app.post("/api/v1/reports/exports", async (req, reply) => {
  const exportingUser = getCurrentUser(req);
  const request = ReportExportRequestSchema.parse(req.body);
  assertReportConfigurationAvailable(request.query, request.columns);
  const scoped = filterFindingsByScope(findings, exportingUser);
  const rows = applyCanonicalReportRules(scoped, request.query.rules, request.query.match);
  if (rows.length > REPORT_EXPORT_MAX_ROWS) {
    throw new HttpProblem(
      422,
      "REPORT_EXPORT_TOO_LARGE",
      "B\xE1o c\xE1o qu\xE1 l\u1EDBn \u0111\u1EC3 xu\u1EA5t",
      `B\u1ED9 l\u1ECDc \u0111ang kh\u1EDBp ${rows.length.toLocaleString("vi-VN")} d\xF2ng, v\u01B0\u1EE3t m\u1EE9c ${REPORT_EXPORT_MAX_ROWS.toLocaleString("vi-VN")} d\xF2ng cho m\u1ED9t l\u1EA7n xu\u1EA5t. H\xE3y thu h\u1EB9p \u0111i\u1EC1u ki\u1EC7n l\u1ECDc (theo chi nh\xE1nh, \u0111o\xE0n ki\u1EC3m tra ho\u1EB7c kho\u1EA3ng th\u1EDDi gian) r\u1ED3i xu\u1EA5t l\u1EA1i.`
    );
  }
  recordUserSecurityEvent(req, exportingUser, {
    type: "DATA_REPORT_EXPORTED",
    outcome: "SUCCESS",
    detail: `Xu\u1EA5t b\xE1o c\xE1o ${request.format.toUpperCase()} g\u1ED3m ${rows.length} d\xF2ng trong ph\u1EA1m vi d\u1EEF li\u1EC7u \u0111\u01B0\u1EE3c c\u1EA5p.`
  });
  await persistLocalState();
  const configuration = normalizedReportCatalogConfiguration();
  const configuredFields = configuration.fields;
  const configuredMetrics = configuration.metrics;
  const columns = request.columns.map((key) => configuredFields.find((field) => field.key === key));
  const dateStamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const exportValue = (key, finding) => {
    const field = configuredFields.find((item) => item.key === key);
    const value = reportFieldAccessors[key](finding);
    return field.valueType === "ENUM" || field.valueType === "BOOLEAN" ? reportValueLabel(key, value, finding) : value;
  };
  if (request.format === "csv") {
    const header = columns.map((column) => csvCell(column.label)).join(",");
    const csvRows = rows.map((finding) => request.columns.map((key) => csvCell(exportValue(key, finding))).join(","));
    const csv = `\uFEFF${[header, ...csvRows].join("\r\n")}`;
    return reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="audit-bgs-report-${dateStamp}.csv"`).send(csv);
  }
  const run = executeReportRun(scoped, request.query);
  const catalogForLabels = buildReportCatalog(scoped);
  const metricLabel = (key) => {
    const metric = configuredMetrics.find((item) => item.key === key);
    if (metric.unit === "MILLION_VND") return `${metric.label} (tri\u1EC7u \u0111\u1ED3ng)`;
    if (metric.unit === "PERCENT") return `${metric.label} (%)`;
    return metric.label;
  };
  const ruleValue = (rule) => {
    if (rule.operator === "op.is_true" || rule.operator === "op.is_false") return "";
    if (rule.operator === "op.between") return `${String(rule.from ?? "")} \u0111\u1EBFn ${String(rule.to ?? "")}`;
    if (rule.operator === "op.in") return (rule.values || []).join(", ");
    const field = catalogForLabels.fields.find((item) => item.key === rule.key);
    return field?.options?.find((option) => option.value === String(rule.value))?.label || String(rule.value ?? "");
  };
  const report = {
    generatedAt: run.generatedAt,
    filters: request.query.rules.map((rule) => {
      const field = configuredFields.find((item) => item.key === rule.key);
      const operator = REPORT_OPERATOR_CATALOG.find((item) => item.key === rule.operator);
      const value = ruleValue(rule);
      return `${field.label}: ${operator.label}${value ? ` ${value}` : ""}`;
    }),
    summary: [
      { label: "D\xF2ng d\u1EEF li\u1EC7u ph\xF9 h\u1EE3p", value: run.matchedFindingCount },
      ...request.query.metrics.map((key) => ({ label: metricLabel(key), value: run.metricValues[key] || 0 }))
    ],
    groupLabel: configuredFields.find((item) => item.key === request.query.groupBy).label,
    groupColumns: [
      { label: configuredFields.find((item) => item.key === request.query.groupBy).label, kind: "text" },
      ...request.query.metrics.map((key) => ({ label: metricLabel(key), kind: "number" }))
    ],
    groupRows: run.groups.map((row) => [row.label, ...request.query.metrics.map((key) => row.metricValues[key] || 0)]),
    detailColumns: columns.map((column) => ({
      label: column.label,
      kind: column.valueType === "NUMBER" ? "number" : column.valueType === "DATE" ? "date" : column.valueType === "BOOLEAN" ? "boolean" : "text"
    })),
    detailRows: rows.map((finding) => request.columns.map((key) => exportValue(key, finding)))
  };
  if (request.format === "html") {
    return reply.header("content-type", "text/html; charset=utf-8").header("content-disposition", `attachment; filename="audit-bgs-report-${dateStamp}.html"`).send(renderReportHtml(report));
  }
  return reply.header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("content-disposition", `attachment; filename="audit-bgs-report-${dateStamp}.xlsx"`).send(await renderReportXlsx(report));
});
app.get("/api/v1/reports/summary", async (req) => {
  const filters = ReportFilterSchema.parse(req.query);
  const scoped = applyReportFilters(filterFindingsByScope(findings, getCurrentUser(req)), filters);
  const breakdown = (keyOf, labelOf) => {
    const groups = /* @__PURE__ */ new Map();
    for (const finding of scoped) {
      const key = keyOf(finding);
      groups.set(key, [...groups.get(key) || [], finding]);
    }
    return [...groups.entries()].map(([key, items]) => ({
      key,
      label: labelOf(items[0]),
      customerCount: uniqueCustomerCount(items),
      findingCount: items.length,
      exposureAmount: items.reduce((sum, item) => sum + item.exposureAmount, 0)
    })).sort((a, b) => b.findingCount - a.findingCount || a.label.localeCompare(b.label));
  };
  const summary = {
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    totalCustomers: uniqueCustomerCount(scoped),
    totalFindings: scoped.length,
    totalExposure: scoped.reduce((sum, finding) => sum + finding.exposureAmount, 0),
    byBranch: breakdown((finding) => finding.branchCode, (finding) => `${finding.branchCode} \xB7 ${finding.branchName}`).map((row) => ({ ...row, branchCode: row.key })),
    byDepartment: breakdown((finding) => `${finding.branchCode}:${finding.department || "UNASSIGNED"}`, (finding) => finding.department || "Ch\u01B0a ph\xE2n ph\xF2ng").map((row) => ({ ...row, department: row.label })),
    byStatus: breakdown((finding) => finding.workflowStatus, (finding) => workflowStatusLabels[finding.workflowStatus]).map((row) => ({ ...row, workflowStatus: row.key }))
  };
  return summary;
});
app.get("/api/v1/reports/findings.csv", async (req, reply) => {
  const exportingUser = getCurrentUser(req);
  const filters = ReportFilterSchema.parse(req.query);
  const scoped = applyReportFilters(filterFindingsByScope(findings, exportingUser), filters);
  recordUserSecurityEvent(req, exportingUser, {
    type: "DATA_REPORT_EXPORTED",
    outcome: "SUCCESS",
    detail: `Xu\u1EA5t CSV danh s\xE1ch h\u1ED3 s\u01A1 g\u1ED3m ${scoped.length} d\xF2ng trong ph\u1EA1m vi d\u1EEF li\u1EC7u \u0111\u01B0\u1EE3c c\u1EA5p.`
  });
  await persistLocalState();
  const header = "CIF,T\xEAn kh\xE1ch h\xE0ng,C\u1EE5m,Chi nh\xE1nh,Ph\xF2ng,M\xE3 chi nh\xE1nh,C\xE1n b\u1ED9,M\xE3 l\u1ED7i,Ti\xEAu \u0111\u1EC1 l\u1ED7i,Chi ti\u1EBFt l\u1ED7i,Tr\u1EA1ng th\xE1i,D\u01B0 n\u1EE3,Gi\xE1 tr\u1ECB \u1EA3nh h\u01B0\u1EDFng";
  const rows = scoped.map((item) => [item.cif, item.customerName, item.clusterName, item.branchName, item.department, item.branchCode, item.officerName, item.errorCode, item.errorTitle, item.description, item.workflowStatus, item.creditBalance, item.exposureAmount]);
  const csv = `\uFEFF${header}\r
${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  return reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="audit-bgs-findings-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv"`).send(csv);
});
var PORT = Number(process.env.PORT) || 3001;
function assertSafeRuntimeConfiguration(env = process.env) {
  if (env.NODE_ENV !== "production") return;
  const violations = [];
  if (env.AUTH_MODE !== "oidc") violations.push("AUTH_MODE ph\u1EA3i l\xE0 oidc");
  if (env.SEED_DEMO_DATA === "true" || env.SEED_DEMO_USERS === "true") violations.push("SEED_DEMO_DATA kh\xF4ng \u0111\u01B0\u1EE3c b\u1EADt \u1EDF production");
  if (!env.BOOTSTRAP_ADMIN_USERNAME || !env.BOOTSTRAP_ADMIN_PASSWORD_HASH) {
    violations.push("thi\u1EBFu BOOTSTRAP_ADMIN_USERNAME/BOOTSTRAP_ADMIN_PASSWORD_HASH");
  }
  if (!env.BOOTSTRAP_ADMIN_EMAIL?.trim()) {
    violations.push("thi\u1EBFu BOOTSTRAP_ADMIN_EMAIL cho \u0111\u0103ng nh\u1EADp Google OIDC");
  }
  if (!env.OIDC_ISSUER_URL || !env.OIDC_AUDIENCE) violations.push("thi\u1EBFu OIDC_ISSUER_URL/OIDC_AUDIENCE");
  if (!env.GOOGLE_OIDC_CLIENT_ID || !env.GOOGLE_OIDC_CLIENT_SECRET || !env.GOOGLE_OIDC_REDIRECT_URI || !env.GOOGLE_OIDC_STATE_SECRET) {
    violations.push("thi\u1EBFu c\u1EA5u h\xECnh Google OIDC");
  }
  if (env.DATA_STORE_MODE !== "postgres" || !env.DATABASE_URL) violations.push("DATA_STORE_MODE=postgres v\xE0 DATABASE_URL l\xE0 b\u1EAFt bu\u1ED9c");
  if (!env.CRON_SECRET) violations.push("thi\u1EBFu CRON_SECRET");
  if (env.EVIDENCE_STORAGE_MODE !== "google-drive") violations.push("EVIDENCE_STORAGE_MODE ph\u1EA3i l\xE0 google-drive");
  const oauthUserDrive = env.GOOGLE_DRIVE_AUTH_MODE === "oauth-user";
  const googleDriveConfigured = oauthUserDrive ? Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET && env.GOOGLE_OAUTH_REDIRECT_URI && env.GOOGLE_OAUTH_STATE_SECRET && env.GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY) : Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON || env.GOOGLE_SERVICE_ACCOUNT_KEY);
  if (!googleDriveConfigured || !env.GOOGLE_DRIVE_ROOT_FOLDER_ID) violations.push("thi\u1EBFu c\u1EA5u h\xECnh Google Drive");
  if (violations.length > 0) {
    throw new Error(`UNSAFE_PRODUCTION_CONFIGURATION: ${violations.join("; ")}`);
  }
}
async function buildApp() {
  assertSafeRuntimeConfiguration();
  await app.ready();
  return app;
}
async function startServer() {
  try {
    assertSafeRuntimeConfiguration();
    const instance = await buildApp();
    await instance.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`\u{1F680} Audit BGS Backend API Server running at http://localhost:${PORT}/api/v1/`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
if (process.argv[1] && process.argv[1].includes("app.ts")) {
  startServer();
}

// server/src/vercel-handler.ts
var serverlessApp = buildApp();
function getServerlessApp() {
  return serverlessApp;
}
async function handler(request, response) {
  try {
    const app2 = await serverlessApp;
    app2.server.emit("request", request, response);
  } catch (error) {
    appInitializationFailure(response, error);
  }
}
function appInitializationFailure(response, error) {
  console.error("[Vercel] Fastify initialization failed.", error);
  if (response.headersSent) {
    response.destroy(error instanceof Error ? error : void 0);
    return;
  }
  response.statusCode = 500;
  response.setHeader("content-type", "application/problem+json; charset=utf-8");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify({
    type: "about:blank",
    title: "Kh\xF4ng th\u1EC3 kh\u1EDFi t\u1EA1o API",
    status: 500,
    code: "API_INITIALIZATION_FAILED",
    detail: "M\xE1y ch\u1EE7 ch\u01B0a kh\u1EDFi t\u1EA1o \u0111\u01B0\u1EE3c. Qu\u1EA3n tr\u1ECB vi\xEAn h\xE3y ki\u1EC3m tra log tri\u1EC3n khai \u0111\u1EC3 bi\u1EBFt chi ti\u1EBFt."
  }));
}
export {
  handler as default,
  getServerlessApp
};
