"use client";
import React, { useEffect, useState } from "react";
import ClientDetail from "./ClientDetail";
import AssessmentAssistant from "./AssessmentAssistant";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  query,
  where,
  QueryDocumentSnapshot,
  DocumentData,
  orderBy,
} from "firebase/firestore";
import { useClientContext } from "./ClientContext";

export default function ClientWorkspace() {
  const [activeTab, setActiveTab] = useState<"detail" | "assessment">("detail");
  const { currentClient, setCurrentClient, homeNavSignal } = useClientContext();
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
  const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "default-app-id";
  const USER_ID = process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL || "test-user";

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const ref = collection(
          db,
          `artifacts/${APP_ID}/users/${USER_ID}/clients`,
        );
        const q = query(ref, orderBy("createdAt", "asc"));
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name,
          photoUrl: d.data().photoUrl,
          basicInfo: d.data().basicInfo,
        }));
        if (!currentClient && list.length > 0) setCurrentClient(list[0]);
      } finally {
        // no-op
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
        const assessmentsRef = collection(
          db,
          `artifacts/${APP_ID}/users/${USER_ID}/assessments`,
        );
        const qAssess = query(
          assessmentsRef,
          where("clientName", "==", currentClient.name),
        );
        const snap = await getDocs(qAssess);
        type RawAssessment = {
          id: string;
          createdAt?: { seconds?: number };
          assessment?: Record<string, unknown>;
        };
        const assessments: RawAssessment[] = snap.docs.map(
          (d: QueryDocumentSnapshot<DocumentData>) => ({
            id: d.id,
            ...(d.data() as DocumentData),
          }),
        );
        setHasAssessment(assessments.length > 0);
        if (assessments.length === 0) {
          setPersonalInfo({});
          setPrevPersonalInfo(null);
          setChangedKeys(new Set());
          return;
        }
        assessments.sort(
          (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
        );
        const latest = assessments[0];
        const previous = assessments.length > 1 ? assessments[1] : null;
        const extractPersonal = (assessmentDoc: RawAssessment | null) => {
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
      } catch {
        setPersonalError("本人情報の取得に失敗しました");
      } finally {
        setPersonalLoading(false);
      }
    };
    loadPersonal();
  }, [currentClient, APP_ID, USER_ID]);

  return (
    <div className="space-y-6">
      <div className="border-b">
        <nav className="flex gap-4 text-sm">
          <button
            onClick={() => setActiveTab("detail")}
            className={`py-2 px-1 border-b-2 -mb-px ${activeTab === "detail" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            メモ・TODO
          </button>
          <button
            onClick={() => setActiveTab("assessment")}
            className={`py-2 px-1 border-b-2 -mb-px ${activeTab === "assessment" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            アセスメント
          </button>
        </nav>
      </div>
      <div>
        {activeTab === "detail" && (
          <ClientDetail selectedClient={currentClient?.name || ""} />
        )}
        {activeTab === "assessment" && <AssessmentAssistant />}
      </div>
    </div>
  );
}
