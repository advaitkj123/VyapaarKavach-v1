import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Calendar, Filter, Loader2, AlertTriangle, ChevronLeft } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { reportsApi, uploadApi, type Report } from "@/lib/api";

export default function Reports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [uploads, setUploads] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Report generation form state
  const [reportType, setReportType] = useState('compliance');
  const [timePeriod, setTimePeriod] = useState('month');
  const [format, setFormat] = useState('pdf');
  const [selectedUploadId, setSelectedUploadId] = useState('');

  // Fetch reports and uploads on mount
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [reportsRes, uploadsRes] = await Promise.all([
          reportsApi.getHistory(undefined, 1, 20).catch(() => ({ reports: [], pagination: {} })),
          uploadApi.getHistory(1, 50, 'completed').catch(() => ({ uploads: [], pagination: {} })),
        ]);
        setReports(reportsRes.reports || []);
        setUploads(uploadsRes.uploads || []);
        
        // Auto-select first upload
        if (uploadsRes.uploads?.length > 0) {
          setSelectedUploadId(uploadsRes.uploads[0].id);
        }
      } catch (err: any) {
        console.error('Failed to fetch reports:', err);
        setError(err.message || 'Failed to load reports');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleGenerateReport = async () => {
    if (!selectedUploadId) {
      setError('Please select an upload first');
      return;
    }

    setIsGenerating(true);
    setError(null);
    
    try {
      const newReport = await reportsApi.generate({
        upload_id: selectedUploadId,
        report_type: reportType,
        format: format,
        time_period: timePeriod,
      });
      
      // Add new report to the list
      setReports([newReport, ...reports]);
    } catch (err: any) {
      console.error('Failed to generate report:', err);
      setError(err.message || 'Failed to generate report');
    } finally {
      setIsGenerating(false);
    }
  };

const handleDownloadReport = async (reportId: string, reportFormat?: string, filename?: string) => {
    try {
      const blob = await reportsApi.downloadReport(reportId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Ensure filename has correct extension based on report format
      const ext = reportFormat?.toLowerCase() === 'excel' ? 'xlsx' : 
                  reportFormat?.toLowerCase() === 'csv' ? 'csv' : 
                  reportFormat?.toLowerCase() === 'json' ? 'json' : 'pdf';
      const safeFilename = filename || `report_${reportId}.${ext}`;
      a.download = safeFilename.endsWith(`.${ext}`) ? safeFilename : `${safeFilename}.${ext}`;
      
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('Failed to download report:', err);
      setError(err.message || 'Failed to download report');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Ready</Badge>;
      case 'processing':
        return <Badge className="bg-yellow-100 text-yellow-800">Processing</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>;
    }
  };

  const filterReportsByType = (type?: string) => {
    if (!type || type === 'all') return reports;
    return reports.filter(r => r.report_type.toLowerCase() === type.toLowerCase());
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <button onClick={() => window.history.back()} className="text-gray-400 hover:text-gray-700 transition-colors">
                <ChevronLeft className="w-7 h-7" />
              </button>
              Reports
            </h2>
            <p className="text-gray-600 mt-1 ml-10">Generate and download compliance reports</p>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <Card className="bg-red-50 border-red-200">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <p className="text-red-800">{error}</p>
                <Button variant="ghost" size="sm" onClick={() => setError(null)}>
                  Dismiss
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* SAR Info Banner — shows when SAR report type is selected */}
        {reportType === 'sar' && (
          <Card className="bg-gradient-to-r from-orange-500/10 to-red-500/10 border-orange-500/20 dark:border-orange-500/30">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-orange-500/20 shrink-0">
                  <AlertTriangle className="h-5 w-5 text-orange-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-orange-300 text-sm">Suspicious Activity Report (SAR)</h3>
                  <p className="text-xs text-orange-300/70 mt-1 leading-relaxed">
                    SAR reports include FATF Red Flag Indicator mapping, executive summary, structural patterns, 
                    top suspicious addresses, and compliance recommendations. Generated using IBM watsonx.ai 
                    Granite model analysis and SmurfPakad GNN.
                  </p>
                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20">
                      <span className="text-blue-400 font-bold text-[10px]">IBM</span>
                      <span className="text-blue-300/70 text-[10px]">watsonx.ai</span>
                    </div>
                    <span className="text-[10px] text-gray-500">FATF Compliant</span>
                    <span className="text-[10px] text-gray-500">•</span>
                    <span className="text-[10px] text-gray-500">PDF with Branded Tables</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Report generator */}
        <Card>
          <CardHeader>
            <CardTitle>Create Custom Report</CardTitle>
            <CardDescription>Configure and generate a new compliance report</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Select Upload</label>
                <Select value={selectedUploadId} onValueChange={setSelectedUploadId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an upload..." />
                  </SelectTrigger>
                  <SelectContent>
                    {uploads.map((upload) => (
                      <SelectItem key={upload.id} value={upload.id}>
                        {upload.name || upload.filename}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Report Type</label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select report type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compliance">Compliance Report</SelectItem>
                    <SelectItem value="sar">Suspicious Activity Report (SAR)</SelectItem>
                    <SelectItem value="analysis">Transaction Analysis</SelectItem>
                    <SelectItem value="risk">Risk Assessment</SelectItem>
                    <SelectItem value="audit">Audit Trail</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Time Period</label>
                <Select value={timePeriod} onValueChange={setTimePeriod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select time period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">Last 7 Days</SelectItem>
                    <SelectItem value="month">Last 30 Days</SelectItem>
                    <SelectItem value="quarter">Last Quarter</SelectItem>
                    <SelectItem value="year">Last Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Format</label>
                <Select value={format} onValueChange={setFormat}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF Document</SelectItem>
                    <SelectItem value="excel">Excel Spreadsheet</SelectItem>
                    <SelectItem value="csv">CSV File</SelectItem>
                    <SelectItem value="json">JSON Data</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Calendar className="h-4 w-4" />
                <span>Report will include data from selected period</span>
              </div>
              <Button 
                className="bg-crypto-purple hover:bg-crypto-dark-purple"
                onClick={handleGenerateReport}
                disabled={isGenerating || !selectedUploadId}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Generate Report
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Report history */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Report History</CardTitle>
                <CardDescription>Previously generated reports</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-crypto-purple" />
                <span className="ml-3 text-gray-600">Loading reports...</span>
              </div>
            ) : (
              <Tabs defaultValue="all">
                <TabsList>
                  <TabsTrigger value="all">All Reports ({reports.length})</TabsTrigger>
                  <TabsTrigger value="compliance">Compliance</TabsTrigger>
                  <TabsTrigger value="sar">SAR</TabsTrigger>
                  <TabsTrigger value="analysis">Analysis</TabsTrigger>
                </TabsList>

                {['all', 'compliance', 'sar', 'analysis'].map((tabValue) => (
                  <TabsContent key={tabValue} value={tabValue} className="space-y-4 mt-6">
                    {filterReportsByType(tabValue === 'all' ? undefined : tabValue).length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        No reports found. Generate a report above to get started.
                      </div>
                    ) : (
                      filterReportsByType(tabValue === 'all' ? undefined : tabValue).map((report) => (
                        <div
                          key={report.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-start space-x-4 flex-1">
                            <div className="p-3 bg-crypto-purple/10 rounded-lg">
                              <FileText className="h-6 w-6 text-crypto-purple" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-gray-900 truncate">
                                {report.report_type.charAt(0).toUpperCase() + report.report_type.slice(1)} Report
                              </h4>
                              <div className="flex items-center space-x-3 mt-1 text-sm text-gray-600">
                                <span>{new Date(report.created_at).toLocaleDateString()}</span>
                                <span>•</span>
                                <Badge variant="outline">{report.report_type}</Badge>
                                <span>•</span>
                                <span>{report.format.toUpperCase()}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 ml-4">
                            {getStatusBadge(report.status)}
                            {report.status === 'completed' && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleDownloadReport(report.id, report.format, `${report.report_type}_report.${report.format}`)}
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Download
                              </Button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </CardContent>
        </Card>

        {/* Report templates */}
        <Card>
          <CardHeader>
            <CardTitle>Report Templates</CardTitle>
            <CardDescription>Quick access to common report types</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { title: "Weekly SAR", description: "Suspicious Activity Report for the week" },
                { title: "Monthly Compliance", description: "Full compliance report for the month" },
                { title: "Quarterly Risk", description: "Risk assessment and mitigation report" },
              ].map((template, index) => (
                <Card key={index} className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader>
                    <CardTitle className="text-base">{template.title}</CardTitle>
                    <CardDescription className="text-sm">{template.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" className="w-full" size="sm">
                      Use Template
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
