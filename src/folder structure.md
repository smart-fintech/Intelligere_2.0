automation-accounting/
│
├── public/
│   ├── favicon.ico
│   └── logo/
│
├── src/
│   │
│   ├── app/
│   │   ├── App.jsx
│   │   ├── routes.jsx
│   │   ├── providers/
│   │   │   ├── AuthProvider.jsx
│   │   │   ├── ThemeProvider.jsx
│   │   │   └── CompanyProvider.jsx
│   │   └── store/
│   │       ├── index.js
│   │       ├── authStore.js
│   │       ├── companyStore.js
│   │       └── uiStore.js
│   │
│   ├── assets/
│   │   ├── images/
│   │   ├── icons/
│   │   └── fonts/
│   │
│   ├── components/
│   │   ├── common/
│   │   │   ├── Button/
│   │   │   ├── Input/
│   │   │   ├── Select/
│   │   │   ├── Modal/
│   │   │   ├── Drawer/
│   │   │   ├── Dropdown/
│   │   │   ├── Tooltip/
│   │   │   ├── Badge/
│   │   │   ├── Loader/
│   │   │   ├── EmptyState/
│   │   │   └── ConfirmDialog/
│   │   │
│   │   ├── layout/
│   │   │   ├── MainLayout.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   ├── Topbar.jsx
│   │   │   ├── CompanySwitcher.jsx
│   │   │   └── Breadcrumb.jsx
│   │   │
│   │   ├── tables/
│   │   │   ├── DataTable.jsx
│   │   │   ├── TableFilter.jsx
│   │   │   ├── TablePagination.jsx
│   │   │   └── ColumnSelector.jsx
│   │   │
│   │   ├── forms/
│   │   │   ├── FormField.jsx
│   │   │   ├── FormSection.jsx
│   │   │   └── FormActions.jsx
│   │   │
│   │   ├── charts/
│   │   │   ├── LineChart.jsx
│   │   │   ├── BarChart.jsx
│   │   │   ├── PieChart.jsx
│   │   │   └── KPIChart.jsx
│   │   │
│   │   └── ai/
│   │       ├── AIButton.jsx
│   │       ├── AIChat.jsx
│   │       ├── AIInsightCard.jsx
│   │       ├── AIRecommendation.jsx
│   │       ├── AIExplanation.jsx
│   │       └── AICommandBar.jsx
│   │
│   ├── currency/
│   │   ├── index.js
│   │   ├── config.js
│   │   │
│   │   ├── currencies/
│   │   │   └── currencies.js
│   │   │
│   │   ├── services/
│   │   │   ├── exchangeRateService.js
│   │   │   └── currencyService.js
│   │   │
│   │   ├── utils/
│   │   │   ├── formatCurrency.js
│   │   │   ├── convertCurrency.js
│   │   │   ├── roundCurrency.js
│   │   │   └── currencyPrecision.js
│   │   │
│   │   ├── hooks/
│   │   │   ├── useCurrency.js
│   │   │   └── useExchangeRate.js
│   │   │
│   │   └── components/
│   │       ├── CurrencySelector.jsx
│   │       ├── CurrencyDisplay.jsx
│   │       └── ExchangeRateInput.jsx
│   │
│   ├── modules/
│   │   │
│   │   ├── auth/
│   │   │   ├── pages/
│   │   │   │   ├── Login.jsx
│   │   │   │   ├── Register.jsx
│   │   │   │   └── ForgotPassword.jsx
│   │   │   ├── components/
│   │   │   ├── services/
│   │   │   └── hooks/
│   │   │
│   │   ├── dashboard/
│   │   │   ├── pages/
│   │   │   │   └── Dashboard.jsx
│   │   │   ├── components/
│   │   │   │   ├── RevenueCard.jsx
│   │   │   │   ├── ExpenseCard.jsx
│   │   │   │   ├── ReceivableCard.jsx
│   │   │   │   ├── PayableCard.jsx
│   │   │   │   ├── CashFlowCard.jsx
│   │   │   │   └── AIInsightPanel.jsx
│   │   │   └── services/
│   │   │
│   │   ├── company/
│   │   │   ├── pages/
│   │   │   │   ├── CompanyList.jsx
│   │   │   │   ├── CompanyProfile.jsx
│   │   │   │   └── CompanySettings.jsx
│   │   │   ├── components/
│   │   │   ├── services/
│   │   │   └── hooks/
│   │   │
│   │   ├── accounting/
│   │   │   ├── ledger/
│   │   │   │   ├── pages/
│   │   │   │   │   ├── LedgerList.jsx
│   │   │   │   │   ├── LedgerDetails.jsx
│   │   │   │   │   └── LedgerCreate.jsx
│   │   │   │   ├── components/
│   │   │   │   ├── services/
│   │   │   │   └── hooks/
│   │   │   │
│   │   │   ├── journal/
│   │   │   │   ├── pages/
│   │   │   │   ├── components/
│   │   │   │   ├── services/
│   │   │   │   └── hooks/
│   │   │   │
│   │   │   ├── voucher/
│   │   │   │   ├── pages/
│   │   │   │   ├── components/
│   │   │   │   └── services/
│   │   │   │
│   │   │   ├── chartOfAccounts/
│   │   │   ├── trialBalance/
│   │   │   ├── profitLoss/
│   │   │   ├── balanceSheet/
│   │   │   └── cashFlow/
│   │   │
│   │   ├── sales/
│   │   │   ├── invoices/
│   │   │   ├── salesOrders/
│   │   │   ├── quotations/
│   │   │   ├── creditNotes/
│   │   │   ├── customers/
│   │   │   └── receipts/
│   │   │
│   │   ├── purchase/
│   │   │   ├── purchaseInvoices/
│   │   │   ├── purchaseOrders/
│   │   │   ├── debitNotes/
│   │   │   ├── vendors/
│   │   │   └── payments/
│   │   │
│   │   ├── inventory/
│   │   │   ├── products/
│   │   │   ├── warehouses/
│   │   │   ├── stock/
│   │   │   ├── stockTransfer/
│   │   │   ├── stockAdjustment/
│   │   │   ├── bom/
│   │   │   └── inventoryReports/
│   │   │
│   │   ├── taxation/
│   │   │   ├── gst/
│   │   │   ├── gstr1/
│   │   │   ├── gstr2b/
│   │   │   ├── eInvoice/
│   │   │   ├── eWayBill/
│   │   │   ├── taxReports/
│   │   │   └── gstReconciliation/
│   │   │
│   │   ├── banking/
│   │   │   ├── bankAccounts/
│   │   │   ├── bankStatements/
│   │   │   ├── bankReconciliation/
│   │   │   └── payments/
│   │   │
│   │   ├── reports/
│   │   │   ├── accounting/
│   │   │   ├── sales/
│   │   │   ├── purchase/
│   │   │   ├── inventory/
│   │   │   ├── taxation/
│   │   │   └── custom/
│   │   │
│   │   └── automation/
│   │       ├── pages/
│   │       │   ├── AutomationDashboard.jsx
│   │       │   ├── AutomationList.jsx
│   │       │   ├── AutomationCreate.jsx
│   │       │   └── AutomationDetails.jsx
│   │       ├── components/
│   │       │   ├── AutomationCard.jsx
│   │       │   ├── TriggerBuilder.jsx
│   │       │   ├── ConditionBuilder.jsx
│   │       │   ├── ActionBuilder.jsx
│   │       │   ├── WorkflowBuilder.jsx
│   │       │   └── ExecutionHistory.jsx
│   │       ├── services/
│   │       └── hooks/
│   │
│   ├── ai/
│   │   ├── agents/
│   │   │   ├── accountingAgent.js
│   │   │   ├── reconciliationAgent.js
│   │   │   ├── inventoryAgent.js
│   │   │   ├── taxAgent.js
│   │   │   └── reportingAgent.js
│   │   │
│   │   ├── commands/
│   │   │   ├── commandParser.js
│   │   │   └── commandRegistry.js
│   │   │
│   │   ├── insights/
│   │   ├── recommendations/
│   │   └── services/
│   │       ├── aiService.js
│   │       └── aiStreamService.js
│   │
│   ├── api/
│   │   ├── axios.js
│   │   ├── endpoints.js
│   │   ├── interceptors.js
│   │   └── apiError.js
│   │
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useCompany.js
│   │   ├── useDebounce.js
│   │   ├── usePagination.js
│   │   └── usePermission.js
│   │
│   ├── utils/
│   │   ├── currency.js
│   │   ├── gst.js
│   │   ├── dates.js
│   │   ├── numbers.js
│   │   ├── validation.js
│   │   ├── permissions.js
│   │   └── export.js
│   │
│   ├── constants/
│   │   ├── routes.js
│   │   ├── permissions.js
│   │   ├── voucherTypes.js
│   │   ├── gstTypes.js
│   │   └── inventoryTypes.js
│   │
│   ├── styles/
│   │   ├── globals.css
│   │   ├── variables.css
│   │   ├── components.css
│   │   └── themes/
│   │       ├── light.css
│   │       └── dark.css
│   │
│   └── main.jsx
│
├── .env
├── .env.development
├── .env.production
├── .gitignore
├── eslint.config.js
├── package.json
├── vite.config.js
└── README.md





src/
└── currency/
    ├── index.js
    ├── config.js
    │
    ├── currencies/
    │   └── currencies.js
    │
    ├── services/
    │   ├── exchangeRateService.js
    │   └── currencyService.js
    │
    ├── utils/
    │   ├── formatCurrency.js
    │   ├── convertCurrency.js
    │   ├── roundCurrency.js
    │   └── currencyPrecision.js
    │
    ├── hooks/
    │   ├── useCurrency.js
    │   └── useExchangeRate.js
    │
    └── components/
        ├── CurrencySelector.jsx
        ├── CurrencyDisplay.jsx
        └── ExchangeRateInput.jsx