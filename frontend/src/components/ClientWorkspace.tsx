"use client";
import React, { useEffect, useState } from "react";
import ClientDetail from "./ClientDetail";
import AssessmentAssistant from "./AssessmentAssistant";
import { clientApi, assessmentsApi, type Assessment } from "../lib/api-client";
import { useClientContext } from "./ClientContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

export default function ClientWorkspace() {
  const [activeTab, setActiveTab] = useState("detail");
  const {
    currentClient,
    setCurrentClient,
    homeNavSignal,
    assessmentRefreshSignal,
  } = useClientContext();
  // 個別基本情報はアセスメントの本人情報を参照
  const [personalInfo, setPersonalInfo] = useState<Record<string, string>>({});
  const [prevPersonalInfo, setPrevPersonalInfo] = useState<Record<
    string,
    string
  > | null>(null);
  const [changedKeys, setChangedKeys] = useState<Set<string>>(new Set());
  const [hasAssessment, setHasAssessment] = useState(false);
  const [personalLoading, setPersonalLoading] = useState(false);
  const [personalError, setPersonalError] = useState<string | null>(null);

  // prevent unused var lint warnings (values are kept for future UI)
  void personalInfo;
  void prevPersonalInfo;
  void changedKeys;
  void hasAssessment;
  void personalLoading;
  void personalError;

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const clients = await clientApi.getAll();
        const list = clients.map((client) => ({
          id: client.id,
          name: client.name,
          photoUrl: undefined,
          basicInfo: undefined,
        }));
        if (!currentClient && list.length > 0) setCurrentClient(list[0]);
      } catch (error) {
        console.error("Failed to fetch clients:", error);
      }
    };
    fetchClients();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When the global header signals "go home", ensure we show the basic info tab
  useEffect(() => {
    setActiveTab("detail");
  }, [homeNavSignal]);

  // 最新アセスメントから本人情報抽出
  useEffect(() => {
    const loadPersonal = async () => {
      if (!currentClient) {
        setPersonalInfo({});
        setPrevPersonalInfo(null);
        setChangedKeys(new Set());
        setHasAssessment(false);
        return;
      }
      setPersonalLoading(true);
      setPersonalError(null);
      try {
        const assessments = await assessmentsApi.getAll(currentClient.name);
        setHasAssessment(assessments.length > 0);
        if (assessments.length === 0) {
          setPersonalInfo({});
          setPrevPersonalInfo(null);
          setChangedKeys(new Set());
          return;
        }
        // Sort by creation date (most recent first)
        assessments.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        const latest = assessments[0];
        const previous = assessments.length > 1 ? assessments[1] : null;
        const extractPersonal = (assessmentDoc: Assessment | null) => {
          if (!assessmentDoc) return null;
          const assessData = (assessmentDoc.assessment || {}) as Record<
            string,
            unknown
          >;
          for (const formKey of Object.keys(assessData)) {
            const formObj = assessData[formKey] as
              | Record<string, unknown>
              | undefined;
            if (
              formObj &&
              typeof formObj === "object" &&
              "本人情報" in formObj
            ) {
              return (formObj["本人情報"] as Record<string, unknown>) || null;
            }
          }
          return null;
        };
        const latestSection = extractPersonal(latest);
        const prevSection = extractPersonal(previous);
        const fields = [
          "電話番号",
          "生年月日",
          "同居状況",
          "現住所",
          "住民票",
          "住居形態",
          "性別",
        ];
        type SummaryLike = { summary?: unknown };
        const extract = (val: unknown): string => {
          if (val == null) return "";
          if (typeof val === "string") return val;
          if (typeof val === "object") {
            if (
              (val as SummaryLike).summary &&
              typeof (val as SummaryLike).summary === "string"
            )
              return (val as SummaryLike).summary as string;
            return JSON.stringify(val);
          }
          return String(val);
        };
        const latestInfo: Record<string, string> = {};
        const prevInfo: Record<string, string> = {};
        for (const f of fields) {
          latestInfo[f] = latestSection
            ? extract((latestSection as Record<string, unknown>)[f])
            : "";
          prevInfo[f] = prevSection
            ? extract((prevSection as Record<string, unknown>)[f])
            : "";
        }
        const diff = new Set<string>();
        if (previous) {
          for (const f of fields) {
            if (
              latestInfo[f] !== prevInfo[f] &&
              !(latestInfo[f] === "" && prevInfo[f] === "")
            )
              diff.add(f);
          }
        }
        setPersonalInfo(latestInfo);
        setPrevPersonalInfo(previous ? prevInfo : null);
        setChangedKeys(diff);
      } catch (error) {
        console.error("Failed to load personal info:", error);
        setPersonalError("本人情報の取得に失敗しました");
      } finally {
        setPersonalLoading(false);
      }
    };
    loadPersonal();
  }, [currentClient, assessmentRefreshSignal]);

  return (
    <div className="g:col-span-9">
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="detail">メモ・TODO</TabsTrigger>
          <TabsTrigger value="assessment">アセスメント</TabsTrigger>
        </TabsList>

        <TabsContent value="detail" className="space-y-6">
          <ClientDetail selectedClient={currentClient?.name || ""} />
        </TabsContent>

        <TabsContent value="assessment" className="space-y-6">
          <AssessmentAssistant />
        </TabsContent>
      </Tabs>
    </div>
  );
}
