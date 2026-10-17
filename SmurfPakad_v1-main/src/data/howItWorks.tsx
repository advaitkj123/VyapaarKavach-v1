import React from "react";
import { Upload, Network, BarChart4 } from "lucide-react";


export const steps = [
    {
      number: "01",
      icon: <Upload className="h-6 w-6" />,
      title: "Upload Transaction Data",
      description: "Import blockchain transaction edge lists with Source, Destination, Amount, Timestamp, and Token Type columns."
    },
    {
      number: "02",
      icon: <Network className="h-6 w-6" />,
      title: "Graph Analysis",
      description: "Our GNN automatically identifies Fan-Out/Fan-In topologies, layering structures, and suspicious wallet clusters."
    },
    {
      number: "03",
      icon: <BarChart4 className="h-6 w-6" />,
      title: "View Results & Reports",
      description: "Access visualizations of laundering graphs, suspicion scores for wallets, and compliance-ready reports."
    }
  ];
  