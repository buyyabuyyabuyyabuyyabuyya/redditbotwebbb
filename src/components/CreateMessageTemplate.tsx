"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";

export default function CreateMessageTemplate() {
  const { user } = useUser();
  const [templateText, setTemplateText] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [savedTemplates, setSavedTemplates] = useState<
    { id: string; name: string; text: string }[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleTemplateClick = (template: {
    id: string;
    name: string;
    text: string;
  }) => {
    setTemplateName(template.name);
    setTemplateText(template.text);
    setSelectedTemplateId(template.id);
    setIsEditing(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName || !templateText) {
      toast.error("Both name and text are required.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/templates", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedTemplateId,
          name: templateName,
          text: templateText,
          userId: user?.id,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save template");
      }

      const savedTemplate = await res.json();

      if (isEditing) {
        setSavedTemplates((prev) =>
          prev.map((t) => (t.id === savedTemplate.id ? savedTemplate : t))
        );
        toast.success("Template updated!");
      } else {
        setSavedTemplates((prev) => [...prev, savedTemplate]);
        toast.success("Template saved!");
      }

      // Reset form
      setTemplateName("");
      setTemplateText("");
      setIsEditing(false);
      setSelectedTemplateId(null);
    } catch (err) {
      toast.error("An error occurred while saving the template.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex gap-4 w-full">
      {/* Template Suggestions - Left Side */}
      {!isEditing && (
        <div className="w-72 bg-gray-800 shadow sm:rounded-lg border border-gray-700 shrink-0">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium leading-6 text-white mb-4">
              Saved Templates
            </h3>
            <ul>
              {savedTemplates.map((template) => (
                <li
                  key={template.id}
                  className="cursor-pointer hover:underline text-sm text-gray-300 mb-2"
                  onClick={() => handleTemplateClick(template)}
                >
                  {template.name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Form - Right Side */}
      <form
        onSubmit={handleSubmit}
        className="bg-gray-800 shadow sm:rounded-lg border border-gray-700 w-full"
      >
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium leading-6 text-white mb-4">
            {isEditing ? "Edit Template" : "Create New Template"}
          </h3>
          <input
            type="text"
            placeholder="Template Name"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600 mb-4"
          />
          <textarea
            placeholder="Message Text"
            value={templateText}
            onChange={(e) => setTemplateText(e.target.value)}
            className="w-full h-40 p-2 rounded bg-gray-700 text-white border border-gray-600 mb-4"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            {isLoading ? "Saving..." : isEditing ? "Update Template" : "Save Template"}
          </button>
        </div>
      </form>
    </div>
  );
}
